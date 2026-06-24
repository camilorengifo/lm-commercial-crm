import type { SupabaseClient } from "@supabase/supabase-js";
import { getFollowUpBucket } from "@/lib/followUps";
import {
  normalizeUserRole,
  type UserRole,
} from "@/lib/userProfile";
import { isOpenOpportunityStage } from "@/lib/crmConstants";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  assertSafeInviteRedirect,
  getInviteRedirectUrl,
} from "@/lib/appUrl";
import { INVITE_PASSWORD_SETUP_KEY } from "@/lib/invitationSession";

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  companyCount: number;
  followUpsDueToday: number;
  openOpportunities: number;
}

function isOpenOpportunityStatus(status: string): boolean {
  return isOpenOpportunityStage(status);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; lastSignInAt: string | null } | null> {
  let page = 1;
  const normalized = normalizeEmail(email);

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const match = users.find(
      (user) => user.email && normalizeEmail(user.email) === normalized,
    );

    if (match) {
      return {
        id: match.id,
        lastSignInAt: match.last_sign_in_at ?? null,
      };
    }

    if (users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const [
    profilesResult,
    companiesResult,
    followUpsResult,
    opportunitiesResult,
  ] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, role, is_active, created_at").order("email"),
    admin.from("companies").select("user_id"),
    admin.from("follow_ups").select("user_id, due_at, status").eq("status", "pending"),
    admin.from("load_opportunities").select("user_id, status"),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (companiesResult.error) throw companiesResult.error;
  if (followUpsResult.error) throw followUpsResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const authUsersById = new Map<string, string | null>();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    for (const user of data.users ?? []) {
      authUsersById.set(user.id, user.last_sign_in_at ?? null);
    }

    if ((data.users ?? []).length < 200) break;
    page += 1;
  }

  const companyCountByUser = new Map<string, number>();
  for (const company of companiesResult.data ?? []) {
    companyCountByUser.set(
      company.user_id,
      (companyCountByUser.get(company.user_id) ?? 0) + 1,
    );
  }

  const followUpsDueTodayByUser = new Map<string, number>();
  for (const followUp of followUpsResult.data ?? []) {
    if (getFollowUpBucket(followUp.due_at) === "today") {
      followUpsDueTodayByUser.set(
        followUp.user_id,
        (followUpsDueTodayByUser.get(followUp.user_id) ?? 0) + 1,
      );
    }
  }

  const openOpportunitiesByUser = new Map<string, number>();
  for (const opportunity of opportunitiesResult.data ?? []) {
    if (isOpenOpportunityStatus(opportunity.status)) {
      openOpportunitiesByUser.set(
        opportunity.user_id,
        (openOpportunitiesByUser.get(opportunity.user_id) ?? 0) + 1,
      );
    }
  }

  return (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email ?? "—",
    fullName: profile.full_name,
    role: normalizeUserRole(profile.role),
    isActive: profile.is_active ?? true,
    createdAt: profile.created_at ?? null,
    lastSignInAt: authUsersById.get(profile.id) ?? null,
    companyCount: companyCountByUser.get(profile.id) ?? 0,
    followUpsDueToday: followUpsDueTodayByUser.get(profile.id) ?? 0,
    openOpportunities: openOpportunitiesByUser.get(profile.id) ?? 0,
  }));
}

export async function inviteAdminUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
}): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const email = input.email.trim();
  const fullName = input.fullName.trim();
  const role = input.role;

  const existingAuthUser = await findAuthUserByEmail(admin, email);
  if (existingAuthUser) {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: existingAuthUser.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      throw profileError;
    }

    return {
      message:
        "A user with this email already exists. Their profile was updated.",
    };
  }

  assertSafeInviteRedirect();
  const redirectTo = getInviteRedirectUrl();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
      [INVITE_PASSWORD_SETUP_KEY]: true,
    },
    redirectTo,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return {
        message: "A user with this email already exists.",
      };
    }
    throw error;
  }

  if (data.user) {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      throw profileError;
    }
  }

  return { message: "Invitation sent successfully." };
}

export async function updateAdminUser(input: {
  targetUserId: string;
  actingAdminId: string;
  role?: UserRole;
  isActive?: boolean;
}): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", input.targetUserId)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!targetProfile) {
    throw new Error("User not found.");
  }

  if (
    input.role === "broker" &&
    input.targetUserId === input.actingAdminId
  ) {
    throw new Error("You cannot change your own role from admin to broker.");
  }

  if (input.role === "broker" && targetProfile.role === "admin") {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new Error("Cannot remove the last active admin.");
    }
  }

  const updates: {
    role?: UserRole;
    is_active?: boolean;
  } = {};

  if (input.role !== undefined) {
    updates.role = input.role;
  }

  if (input.isActive !== undefined) {
    if (!input.isActive && input.targetUserId === input.actingAdminId) {
      throw new Error("You cannot deactivate your own account.");
    }
    updates.is_active = input.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return { message: "No changes to save." };
  }

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", input.targetUserId);

  if (error) throw error;

  return { message: "User updated successfully." };
}

const CRM_OWNERSHIP_TABLES = [
  "companies",
  "contacts",
  "activities",
  "follow_ups",
  "load_opportunities",
  "broker_reminder_logs",
] as const;

export class UserDeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserDeleteBlockedError";
  }
}

async function userOwnsCrmRecords(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const counts = await Promise.all(
    CRM_OWNERSHIP_TABLES.map(async (table) => {
      const { count, error } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (error) throw error;
      return count ?? 0;
    }),
  );

  return counts.some((count) => count > 0);
}

export async function deleteAdminUser(input: {
  targetUserId: string;
  actingAdminId: string;
}): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) {
    throw new Error("User ID is required.");
  }

  if (targetUserId === input.actingAdminId) {
    throw new Error("You cannot delete your own account.");
  }

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError) throw targetError;

  if (targetProfile?.role === "admin") {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new Error("Cannot delete the last admin.");
    }
  }

  const ownsRecords = await userOwnsCrmRecords(admin, targetUserId);
  if (ownsRecords) {
    throw new UserDeleteBlockedError(
      "This user owns CRM records. Reassign or deactivate the user instead of deleting.",
    );
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(
    targetUserId,
  );

  if (authDeleteError) {
    if (authDeleteError.message.toLowerCase().includes("not found")) {
      const { error: profileDeleteError } = await admin
        .from("profiles")
        .delete()
        .eq("id", targetUserId);

      if (profileDeleteError) throw profileDeleteError;

      return { message: "User deleted successfully." };
    }

    throw authDeleteError;
  }

  return { message: "User deleted successfully." };
}

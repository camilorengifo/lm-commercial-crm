import type { SupabaseClient } from "@supabase/supabase-js";
import { getFollowUpBucket } from "@/lib/followUps";
import {
  normalizeUserRole,
  type UserRole,
} from "@/lib/userProfile";
import { isOpenOpportunityStage } from "@/lib/crmConstants";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { assertSafeInviteRedirect } from "@/lib/appUrl";
import { sendInvitationEmail } from "@/lib/invitationEmail";
import { createUserInvitation } from "@/lib/userInvitations";

const CRM_OWNERSHIP_TABLES = [
  "companies",
  "contacts",
  "activities",
  "follow_ups",
  "load_opportunities",
  "broker_reminder_logs",
] as const;

const COMPANY_SCOPED_OWNERSHIP_TABLES = [
  "contacts",
  "activities",
  "follow_ups",
  "load_opportunities",
  "company_ai_insights",
] as const;

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
  ownsCrmRecords: boolean;
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

  const usersWithCrmRecords = await getUserIdsWithCrmRecords(admin);

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
    ownsCrmRecords: usersWithCrmRecords.has(profile.id),
  }));
}

async function getUserIdsWithCrmRecords(
  admin: SupabaseClient,
): Promise<Set<string>> {
  const userIds = new Set<string>();

  await Promise.all(
    CRM_OWNERSHIP_TABLES.map(async (table) => {
      const { data, error } = await admin.from(table).select("user_id");

      if (error) throw error;

      for (const row of data ?? []) {
        if (typeof row.user_id === "string") {
          userIds.add(row.user_id);
        }
      }
    }),
  );

  return userIds;
}

export async function inviteAdminUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
  actingAdminId?: string;
}): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  assertSafeInviteRedirect();

  const email = input.email.trim();
  const fullName = input.fullName.trim();
  const role = input.role;

  const existingAuthUser = await findAuthUserByEmail(admin, email);

  const { inviteLink } = await createUserInvitation({
    email,
    fullName,
    role,
    invitedBy: input.actingAdminId,
    existingUser: Boolean(existingAuthUser),
    authUserId: existingAuthUser?.id ?? null,
  });

  const emailResult = await sendInvitationEmail({
    to: email,
    fullName,
    inviteLink,
    existingUser: Boolean(existingAuthUser),
  });

  if (emailResult.error && process.env.VERCEL === "1") {
    throw new Error(emailResult.error);
  }

  if (existingAuthUser) {
    return {
      message: emailResult.sent
        ? "This user already exists. A password setup invitation was sent to their email."
        : "This user already exists. Invitation link was generated — check server logs for the link.",
    };
  }

  return {
    message: emailResult.sent
      ? "Invitation sent successfully."
      : "Invitation created. Check server logs for the invitation link.",
  };
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

export type AdminUserRemoveMode = "delete" | "deactivate" | "reassign";

const USER_ACCESS_REMOVED_MESSAGE = "User access removed successfully.";

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

async function assertActiveReassignTarget(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data || data.is_active === false) {
    throw new Error("Target user profile not found or inactive.");
  }
}

async function reassignCompanyOwnerAdmin(
  admin: SupabaseClient,
  companyId: string,
  newUserId: string,
): Promise<void> {
  const { error: companyError } = await admin
    .from("companies")
    .update({ user_id: newUserId })
    .eq("id", companyId);

  if (companyError) throw companyError;

  for (const table of COMPANY_SCOPED_OWNERSHIP_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ user_id: newUserId })
      .eq("company_id", companyId);

    if (error) throw error;
  }
}

export async function reassignUserCrmRecordsAdmin(
  admin: SupabaseClient,
  fromUserId: string,
  toUserId: string,
): Promise<number> {
  if (fromUserId === toUserId) {
    throw new Error("Cannot reassign records to the same user.");
  }

  await assertActiveReassignTarget(admin, toUserId);

  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id")
    .eq("user_id", fromUserId);

  if (companiesError) throw companiesError;

  const companyIds = (companies ?? []).map((company) => company.id as string);

  for (const companyId of companyIds) {
    await reassignCompanyOwnerAdmin(admin, companyId, toUserId);
  }

  for (const table of CRM_OWNERSHIP_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ user_id: toUserId })
      .eq("user_id", fromUserId);

    if (error) throw error;
  }

  return companyIds.length;
}

async function assertCanRemoveAdminUser(
  admin: SupabaseClient,
  targetUserId: string,
  actingAdminId: string,
): Promise<void> {
  if (!targetUserId) {
    throw new Error("User ID is required.");
  }

  if (targetUserId === actingAdminId) {
    throw new Error("You cannot remove your own account.");
  }

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError) throw targetError;

  if (!targetProfile) {
    throw new Error("User not found.");
  }

  if (targetProfile.role === "admin") {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new Error("Cannot remove the last admin.");
    }
  }
}

async function deactivateAdminUserAccess(
  admin: SupabaseClient,
  targetUserId: string,
): Promise<{ message: string }> {
  const { error } = await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", targetUserId);

  if (error) throw error;

  return { message: USER_ACCESS_REMOVED_MESSAGE };
}

async function hardDeleteAdminUser(
  admin: SupabaseClient,
  targetUserId: string,
): Promise<{ message: string }> {
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

      return { message: USER_ACCESS_REMOVED_MESSAGE };
    }

    throw authDeleteError;
  }

  return { message: USER_ACCESS_REMOVED_MESSAGE };
}

export async function removeAdminUser(input: {
  targetUserId: string;
  actingAdminId: string;
  mode: AdminUserRemoveMode;
  reassignToUserId?: string;
  confirmedForceDelete?: boolean;
}): Promise<{ message: string; reassignedCompanies?: number }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const targetUserId = input.targetUserId.trim();
  const reassignToUserId = input.reassignToUserId?.trim() || undefined;

  await assertCanRemoveAdminUser(admin, targetUserId, input.actingAdminId);

  const ownsRecords = await userOwnsCrmRecords(admin, targetUserId);

  if (input.mode === "reassign") {
    if (!reassignToUserId) {
      throw new Error("Select a broker or admin to receive the records.");
    }

    if (!ownsRecords) {
      return { message: "This user has no CRM records to reassign." };
    }

    const reassignedCompanies = await reassignUserCrmRecordsAdmin(
      admin,
      targetUserId,
      reassignToUserId,
    );

    return {
      message: `${reassignedCompanies} compan${reassignedCompanies === 1 ? "y" : "ies"} reassigned successfully.`,
      reassignedCompanies,
    };
  }

  if (input.mode === "deactivate") {
    return deactivateAdminUserAccess(admin, targetUserId);
  }

  if (ownsRecords) {
    if (!input.confirmedForceDelete) {
      throw new UserDeleteBlockedError(
        "Type DELETE to confirm removal of a user who owns CRM records.",
      );
    }

    if (!reassignToUserId) {
      throw new UserDeleteBlockedError(
        "This user owns CRM records. Choose a broker or admin to receive the records, or deactivate the user instead.",
      );
    }

    const reassignedCompanies = await reassignUserCrmRecordsAdmin(
      admin,
      targetUserId,
      reassignToUserId,
    );

    const stillOwnsRecords = await userOwnsCrmRecords(admin, targetUserId);
    if (stillOwnsRecords) {
      throw new UserDeleteBlockedError(
        "Unable to delete this user because CRM records could not be fully reassigned. Try deactivating the user instead.",
      );
    }

    const result = await hardDeleteAdminUser(admin, targetUserId);

    return {
      ...result,
      reassignedCompanies,
    };
  }

  return hardDeleteAdminUser(admin, targetUserId);
}

export async function deleteAdminUser(input: {
  targetUserId: string;
  actingAdminId: string;
}): Promise<{ message: string }> {
  return removeAdminUser({
    targetUserId: input.targetUserId,
    actingAdminId: input.actingAdminId,
    mode: "delete",
  });
}

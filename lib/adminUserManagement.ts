import type { SupabaseClient } from "@supabase/supabase-js";
import { getFollowUpBucket } from "@/lib/followUps";
import {
  isAssignableCompanyOwnerRole,
  normalizeUserRole,
  type UserRole,
} from "@/lib/userProfile";
import {
  isOpenOpportunityStage,
  OPEN_OPPORTUNITY_STATUSES,
} from "@/lib/crmConstants";
import {
  deletionAllowedAfterReassignment,
  formatCrmRemovalMessage,
  mandatoryOwnershipRemaining,
  parseReassignmentCounts,
  type CrmOwnershipInspection,
  type CrmReassignmentCounts,
} from "@/lib/crmOwnership";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { assertSafeInviteRedirect } from "@/lib/appUrl";
import { sendInvitationEmail } from "@/lib/invitationEmail";
import { createUserInvitation } from "@/lib/userInvitations";
import { UNASSIGNED_OFFICE_LABEL } from "@/lib/offices";
import {
  assertPrimarySuperAdminNotRemovable,
  assertSuperAdminRoleMutationAllowed,
  canManageSuperAdminRole,
  SuperAdminProtectionError,
} from "@/lib/primarySuperAdmin";

export { SuperAdminProtectionError };

const CRM_OWNERSHIP_TABLES = [
  "companies",
  "contacts",
  "activities",
  "follow_ups",
  "load_opportunities",
  "company_ai_insights",
  "outreach_suppressions",
  "broker_reminder_logs",
  "user_carriers",
  "ai_broker_assistant_runs",
] as const;

const OPTIONAL_OWNERSHIP_TABLES = new Set<string>([
  "outreach_suppressions",
  "ai_broker_assistant_runs",
]);

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  officeId: string | null;
  officeName: string;
  isActive: boolean;
  isBlocked: boolean;
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

async function fetchDistinctUserIds(
  admin: SupabaseClient,
  table: string,
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from(table)
      .select("user_id")
      .order("user_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    for (const row of batch) {
      if (typeof row.user_id === "string") {
        ids.push(row.user_id);
      }
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

async function fetchCompanyOwnershipByUser(
  admin: SupabaseClient,
): Promise<{
  companyCountByUser: Map<string, number>;
  companyOwnerIds: string[];
}> {
  const companyCountByUser = new Map<string, number>();
  const ownerIdSet = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from("companies")
      .select("user_id, deleted_at")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    for (const row of batch) {
      if (typeof row.user_id !== "string") continue;
      ownerIdSet.add(row.user_id);
      if (row.deleted_at == null) {
        companyCountByUser.set(
          row.user_id,
          (companyCountByUser.get(row.user_id) ?? 0) + 1,
        );
      }
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return {
    companyCountByUser,
    companyOwnerIds: [...ownerIdSet],
  };
}

async function fetchAllPendingFollowUpRows(
  admin: SupabaseClient,
): Promise<Array<{ user_id: string; due_at: string; status: string }>> {
  const rows: Array<{ user_id: string; due_at: string; status: string }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from("follow_ups")
      .select("user_id, due_at, status")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function fetchOpenOpportunityUserIds(
  admin: SupabaseClient,
): Promise<Map<string, number>> {
  const openOpportunitiesByUser = new Map<string, number>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from("load_opportunities")
      .select("user_id, status")
      .in("status", [...OPEN_OPPORTUNITY_STATUSES])
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    for (const opportunity of batch) {
      if (isOpenOpportunityStatus(opportunity.status)) {
        openOpportunitiesByUser.set(
          opportunity.user_id,
          (openOpportunitiesByUser.get(opportunity.user_id) ?? 0) + 1,
        );
      }
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return openOpportunitiesByUser;
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const [
    profilesResult,
    officesResult,
    companyOwnership,
    pendingFollowUps,
    opportunityOwnerIds,
    openOpportunitiesByUser,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, email, full_name, role, is_active, is_blocked, created_at, office_id",
      )
      .order("email"),
    admin.from("offices").select("id, name").eq("is_active", true),
    fetchCompanyOwnershipByUser(admin),
    fetchAllPendingFollowUpRows(admin),
    fetchDistinctUserIds(admin, "load_opportunities"),
    fetchOpenOpportunityUserIds(admin),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (officesResult.error) throw officesResult.error;

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

  const { companyCountByUser, companyOwnerIds } = companyOwnership;

  const followUpsDueTodayByUser = new Map<string, number>();
  for (const followUp of pendingFollowUps) {
    if (getFollowUpBucket(followUp.due_at) === "today") {
      followUpsDueTodayByUser.set(
        followUp.user_id,
        (followUpsDueTodayByUser.get(followUp.user_id) ?? 0) + 1,
      );
    }
  }

  // ownsCrmRecords: companies + follow_ups + opportunities already loaded; skip 6-table rescan.
  const usersWithCrmRecords = new Set<string>([
    ...companyOwnerIds,
    ...pendingFollowUps.map((row) => row.user_id),
    ...opportunityOwnerIds,
  ]);

  const officeNameById = new Map(
    (officesResult.data ?? []).map((office) => [office.id, office.name]),
  );

  return (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email ?? "—",
    fullName: profile.full_name,
    role: normalizeUserRole(profile.role),
    officeId: profile.office_id ?? null,
    officeName: profile.office_id
      ? officeNameById.get(profile.office_id) ?? UNASSIGNED_OFFICE_LABEL
      : UNASSIGNED_OFFICE_LABEL,
    isActive: profile.is_active ?? true,
    isBlocked: profile.is_blocked === true,
    createdAt: profile.created_at ?? null,
    lastSignInAt: authUsersById.get(profile.id) ?? null,
    companyCount: companyCountByUser.get(profile.id) ?? 0,
    followUpsDueToday: followUpsDueTodayByUser.get(profile.id) ?? 0,
    openOpportunities: openOpportunitiesByUser.get(profile.id) ?? 0,
    ownsCrmRecords: usersWithCrmRecords.has(profile.id),
  }));
}

async function fetchActingAdminEmail(
  admin: SupabaseClient,
  actingAdminId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .eq("id", actingAdminId)
    .maybeSingle();

  if (error) throw error;
  return data?.email ?? null;
}

export async function inviteAdminUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
  officeId?: string | null;
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

  if (role === "super_admin") {
    if (!input.actingAdminId) {
      throw new SuperAdminProtectionError(
        "Only the primary super admin can invite a super_admin user.",
      );
    }

    const actingEmail = await fetchActingAdminEmail(admin, input.actingAdminId);
    if (!canManageSuperAdminRole(actingEmail)) {
      throw new SuperAdminProtectionError(
        "Only the primary super admin can invite a super_admin user.",
      );
    }
  }

  const existingAuthUser = await findAuthUserByEmail(admin, email);

  const { inviteLink } = await createUserInvitation({
    email,
    fullName,
    role,
    invitedBy: input.actingAdminId,
    existingUser: Boolean(existingAuthUser),
    authUserId: existingAuthUser?.id ?? null,
    officeId: input.officeId ?? null,
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
  officeId?: string | null;
}): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const [{ data: targetProfile, error: targetError }, actingEmail] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, role, email, is_active")
        .eq("id", input.targetUserId)
        .maybeSingle(),
      fetchActingAdminEmail(admin, input.actingAdminId),
    ]);

  if (targetError) throw targetError;
  if (!targetProfile) {
    throw new Error("User not found.");
  }

  assertSuperAdminRoleMutationAllowed({
    actingEmail,
    targetEmail: targetProfile.email,
    currentRole: normalizeUserRole(targetProfile.role),
    nextRole: input.role,
    nextIsActive: input.isActive,
  });

  if (
    input.role === "broker" &&
    input.targetUserId === input.actingAdminId
  ) {
    throw new Error("You cannot change your own role from admin to broker.");
  }

  if (
    input.role === "broker" &&
    (targetProfile.role === "admin" || targetProfile.role === "super_admin")
  ) {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "super_admin"])
      .eq("is_active", true);

    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      throw new Error("Cannot remove the last active admin.");
    }
  }

  const updates: {
    role?: UserRole;
    is_active?: boolean;
    office_id?: string | null;
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

  if (input.officeId !== undefined) {
    if (input.officeId) {
      const { data: office, error: officeError } = await admin
        .from("offices")
        .select("id")
        .eq("id", input.officeId)
        .eq("is_active", true)
        .maybeSingle();

      if (officeError) throw officeError;
      if (!office) {
        throw new Error("Selected office is not available.");
      }
    }

    updates.office_id = input.officeId;
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

export class ReassignmentInProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReassignmentInProgressError";
  }
}

interface CrmRemovalLog {
  stage: string;
  targetUserId: string;
  destinationUserId?: string;
  table?: string;
  code?: string;
  message?: string;
  counts?: CrmReassignmentCounts;
}

function logCrmRemoval(event: CrmRemovalLog): void {
  console.info(JSON.stringify({ source: "crm-user-removal", ...event }));
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Unable to remove user.";
}

function isMissingRpcError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return (
    code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("schema cache")
  );
}

function isMissingOwnershipTableError(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function ignoreMissingOptionalTable(
  table: string,
  error: { message?: string; code?: string } | null,
): boolean {
  return (
    error !== null &&
    OPTIONAL_OWNERSHIP_TABLES.has(table) &&
    isMissingOwnershipTableError(error)
  );
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

      if (error) {
        if (ignoreMissingOptionalTable(table, error)) return 0;
        throw error;
      }
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
    .select("id, role, is_active, is_blocked")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    data.is_active === false ||
    data.is_blocked === true ||
    !isAssignableCompanyOwnerRole(data.role)
  ) {
    throw new Error(
      "Companies can only be reassigned to an active broker, admin, or super admin.",
    );
  }
}

const REASSIGNMENT_MIGRATION_MESSAGE =
  "CRM reassignment is unavailable until database migration 035_reassign_user_crm_ownership.sql is applied. No records were changed by this attempt.";

async function countOwnedRows(
  admin: SupabaseClient,
  table: string,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    if (ignoreMissingOptionalTable(table, error)) return 0;
    logCrmRemoval({
      stage: "count",
      targetUserId: userId,
      table,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  return count ?? 0;
}

async function inspectOwnershipFromTables(
  admin: SupabaseClient,
  userId: string,
): Promise<CrmOwnershipInspection> {
  const [
    companies,
    contacts,
    activities,
    followUps,
    loadOpportunities,
    companyAiInsights,
    outreachSuppressions,
    brokerReminderLogs,
    userCarriers,
    aiBrokerAssistantRuns,
  ] = await Promise.all([
    countOwnedRows(admin, "companies", userId),
    countOwnedRows(admin, "contacts", userId),
    countOwnedRows(admin, "activities", userId),
    countOwnedRows(admin, "follow_ups", userId),
    countOwnedRows(admin, "load_opportunities", userId),
    countOwnedRows(admin, "company_ai_insights", userId),
    countOwnedRows(admin, "outreach_suppressions", userId),
    countOwnedRows(admin, "broker_reminder_logs", userId),
    countOwnedRows(admin, "user_carriers", userId),
    countOwnedRows(admin, "ai_broker_assistant_runs", userId),
  ]);

  return {
    inProgress: false,
    counts: {
      companies,
      contacts,
      activities,
      followUps,
      loadOpportunities,
      companyAiInsights,
      outreachSuppressions,
      brokerReminderLogs,
      userCarriers,
      aiBrokerAssistantRuns,
    },
  };
}

export async function inspectUserCrmOwnershipAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<CrmOwnershipInspection> {
  const { data, error } = await admin.rpc("inspect_user_crm_ownership", {
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      logCrmRemoval({
        stage: "inspect-fallback",
        targetUserId: userId,
        code: errorCode(error),
        message: "Ownership inspection function is not installed.",
      });
      return inspectOwnershipFromTables(admin, userId);
    }

    logCrmRemoval({
      stage: "inspect",
      targetUserId: userId,
      code: errorCode(error),
      message: errorMessage(error),
    });
    throw error;
  }

  const counts = parseReassignmentCounts(data);
  const inProgress =
    !!data &&
    typeof data === "object" &&
    (data as { inProgress?: unknown }).inProgress === true;

  if (!counts) {
    throw new Error("Ownership inspection returned an unexpected result.");
  }

  return { inProgress, counts };
}

async function destinationDisplayName(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  const name = data?.full_name?.trim();
  if (name) return name;
  return data?.email?.trim() || "the selected owner";
}

export async function reassignUserCrmRecordsAdmin(
  admin: SupabaseClient,
  fromUserId: string,
  toUserId: string,
): Promise<CrmReassignmentCounts> {
  if (fromUserId === toUserId) {
    throw new Error("Cannot reassign records to the same user.");
  }

  await assertActiveReassignTarget(admin, toUserId);

  logCrmRemoval({
    stage: "reassign",
    targetUserId: fromUserId,
    destinationUserId: toUserId,
  });

  const { data, error } = await admin.rpc("reassign_user_crm_ownership", {
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
  });

  if (error) {
    logCrmRemoval({
      stage: "reassign",
      targetUserId: fromUserId,
      destinationUserId: toUserId,
      code: errorCode(error),
      message: errorMessage(error),
    });

    if (isMissingRpcError(error)) {
      throw new Error(REASSIGNMENT_MIGRATION_MESSAGE);
    }

    if (
      errorCode(error) === "55P03" ||
      errorMessage(error).toLowerCase().includes("already running")
    ) {
      throw new ReassignmentInProgressError(
        "A reassignment for this user is already running. Wait for it to finish, then check ownership before trying again.",
      );
    }

    throw new Error(errorMessage(error));
  }

  const counts = parseReassignmentCounts(data);
  if (!counts) {
    throw new Error("Reassignment finished without a readable result. Check ownership before trying again.");
  }

  logCrmRemoval({
    stage: "reassign-complete",
    targetUserId: fromUserId,
    destinationUserId: toUserId,
    counts,
  });

  return counts;
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

  assertPrimarySuperAdminNotRemovable({
    targetEmail: targetProfile.email,
  });

  if (
    targetProfile.role === "super_admin" &&
    !canManageSuperAdminRole(
      await fetchActingAdminEmail(admin, actingAdminId),
    )
  ) {
    throw new SuperAdminProtectionError(
      "Only the primary super admin can remove a super_admin user.",
    );
  }

  if (targetProfile.role === "admin" || targetProfile.role === "super_admin") {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "super_admin"]);

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

async function countByColumn(
  admin: SupabaseClient,
  table: string,
  column: string,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, userId);

  if (error) {
    logCrmRemoval({
      stage: "restrict-check",
      targetUserId: userId,
      table,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  return count ?? 0;
}

async function assertNoRestrictingCarrierReferences(
  admin: SupabaseClient,
  targetUserId: string,
  crmReassigned: boolean,
): Promise<void> {
  const [carriers, carrierContacts] = await Promise.all([
    countByColumn(admin, "carriers", "created_by", targetUserId),
    countByColumn(admin, "carrier_contacts", "created_by", targetUserId),
  ]);

  if (carriers === 0 && carrierContacts === 0) return;

  const ownershipSentence = crmReassigned
    ? "CRM records were reassigned, and the account is still active."
    : "No CRM ownership was changed.";

  throw new UserDeleteBlockedError(
    `This account was not deleted because carrier directory records list this user as their creator. ${ownershipSentence} Reassign those carrier records before deleting the account.`,
  );
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

export interface AdminUserRemovalResult {
  message: string;
  reassignedCompanies?: number;
  counts?: CrmReassignmentCounts;
  accountDeleted: boolean;
}

async function reassignAndVerify(
  admin: SupabaseClient,
  targetUserId: string,
  reassignToUserId: string,
): Promise<CrmReassignmentCounts> {
  const counts = await reassignUserCrmRecordsAdmin(
    admin,
    targetUserId,
    reassignToUserId,
  );

  const inspection = await inspectUserCrmOwnershipAdmin(admin, targetUserId);
  if (!deletionAllowedAfterReassignment(inspection.counts)) {
    logCrmRemoval({
      stage: "verify",
      targetUserId,
      destinationUserId: reassignToUserId,
      counts: inspection.counts,
      message: "Required CRM records remained after reassignment.",
    });
    throw new UserDeleteBlockedError(
      `${mandatoryOwnershipRemaining(inspection.counts)} required CRM records are still assigned to this user. The account was not deleted.`,
    );
  }

  return counts;
}

export async function removeAdminUser(input: {
  targetUserId: string;
  actingAdminId: string;
  mode: AdminUserRemoveMode;
  reassignToUserId?: string;
  confirmedForceDelete?: boolean;
}): Promise<AdminUserRemovalResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const targetUserId = input.targetUserId.trim();
  const reassignToUserId = input.reassignToUserId?.trim() || undefined;

  logCrmRemoval({
    stage: input.mode,
    targetUserId,
    destinationUserId: reassignToUserId,
  });

  await assertCanRemoveAdminUser(admin, targetUserId, input.actingAdminId);

  const ownsRecords = await userOwnsCrmRecords(admin, targetUserId);

  if (input.mode === "reassign" && !ownsRecords) {
    return {
      message: "This user has no CRM records to reassign.",
      accountDeleted: false,
      reassignedCompanies: 0,
    };
  }

  if (input.mode === "deactivate") {
    const result = await deactivateAdminUserAccess(admin, targetUserId);
    return { ...result, accountDeleted: false };
  }

  if (input.mode === "reassign" || ownsRecords) {
    if (!reassignToUserId) {
      throw new UserDeleteBlockedError(
        "Select an owner to receive the records.",
      );
    }

    if (input.mode === "delete" && !input.confirmedForceDelete) {
      throw new UserDeleteBlockedError(
        "Type DELETE to confirm removal of a user who owns CRM records.",
      );
    }

    const destinationName = await destinationDisplayName(
      admin,
      reassignToUserId,
    );
    const counts = await reassignAndVerify(
      admin,
      targetUserId,
      reassignToUserId,
    );

    if (input.mode === "reassign") {
      return {
        message: formatCrmRemovalMessage({
          counts,
          accountDeleted: false,
          destinationName,
        }),
        reassignedCompanies: counts.companies,
        counts,
        accountDeleted: false,
      };
    }

    await assertNoRestrictingCarrierReferences(admin, targetUserId, true);

    logCrmRemoval({
      stage: "delete-auth",
      targetUserId,
      destinationUserId: reassignToUserId,
      counts,
    });

    await hardDeleteAdminUser(admin, targetUserId);

    return {
      message: formatCrmRemovalMessage({
        counts,
        accountDeleted: true,
        destinationName,
      }),
      reassignedCompanies: counts.companies,
      counts,
      accountDeleted: true,
    };
  }

  await assertNoRestrictingCarrierReferences(admin, targetUserId, false);
  logCrmRemoval({ stage: "delete-auth", targetUserId });
  const result = await hardDeleteAdminUser(admin, targetUserId);
  return { ...result, accountDeleted: true };
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

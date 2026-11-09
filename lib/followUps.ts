import {
  normalizeAccountStatus,
  type AccountStatus,
} from "@/lib/accountStatus";
import {
  updatesLastContactAt,
  type ActivityType,
  type CompanyPriority,
  type FollowUpStatus,
} from "@/lib/crmConstants";
import {
  fetchSuppressionIndex,
  followUpCreateBlockMessage,
} from "@/lib/outreachSuppression";
import { isFollowUpOutreachSuppressed } from "@/lib/outreachSuppressionRules";
import {
  resolveFollowUpSeasonalFields,
  type FollowUpType,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import { enforceBrokerOwnedRows, fetchOwnedCompanyIdsForViewer } from "@/lib/brokerDataAccess";
import {
  getWeekBounds,
  isPendingFollowUpStatus,
  selectFollowUpsForAssignedCompanies,
} from "@/lib/followUpClassification";
import { supabase } from "@/lib/supabaseClient";

export {
  BUSINESS_TIMEZONE,
  bucketFollowUpsWithCompanies,
  businessCalendarDate,
  getDayBounds,
  getDaysOverdue,
  getFollowUpBucket,
  getWeekBounds,
  isPendingFollowUpStatus,
  selectFollowUpsForAssignedCompanies,
  type FollowUpBucket,
} from "@/lib/followUpClassification";

const IN_FILTER_CHUNK_SIZE = 80;
/** Read size only. Pending follow-ups are paged until exhausted so a later due date is never dropped before classification. */
const FOLLOW_UP_PAGE_SIZE = 1000;

function logFollowUpsQueryError(
  context: string,
  error: { message?: string; code?: string; details?: string } | null,
): void {
  if (process.env.NODE_ENV !== "development" || !error) {
    return;
  }

  console.error("[follow-ups]", context, {
    message: error.message,
    code: error.code,
    details: error.details,
  });
}

async function fetchCompanyRowsByIds(
  companyIds: string[],
  select: string,
  options?: { userId?: string; personalOnly?: boolean },
): Promise<{
  data: Record<string, unknown>[];
  error: { message?: string; code?: string; details?: string } | null;
}> {
  if (companyIds.length === 0) {
    return { data: [], error: null };
  }

  const rows: Record<string, unknown>[] = [];

  for (let index = 0; index < companyIds.length; index += IN_FILTER_CHUNK_SIZE) {
    const chunk = companyIds.slice(index, index + IN_FILTER_CHUNK_SIZE);
    let query = supabase.from("companies").select(select).in("id", chunk);

    if (options?.personalOnly && options.userId) {
      query = query.eq("user_id", options.userId).is("deleted_at", null);
    }

    const { data, error } = await query;
    if (error) {
      logFollowUpsQueryError("fetchCompanyRowsByIds", error);
      return { data: [], error };
    }

    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }

  return { data: rows, error: null };
}

export const FOLLOW_UP_COMPLETED_LIMIT = 100;

export type { FollowUpStatus };

export const FOLLOW_UP_SELECT_FIELDS =
  "id, user_id, company_id, contact_id, title, notes, due_at, status, completed_at, created_at, follow_up_type, reminder_lead_days, reminder_start_date, seasonal_context, disposition_reason, disposition_notes, disposition_at, disposition_by";

export interface FollowUpRecord {
  id: string;
  user_id: string;
  company_id: string;
  contact_id?: string | null;
  title: string;
  notes: string | null;
  due_at: string;
  status: FollowUpStatus;
  completed_at: string | null;
  created_at: string;
  follow_up_type?: FollowUpType | string | null;
  reminder_lead_days?: number | null;
  reminder_start_date?: string | null;
  seasonal_context?: string | null;
  disposition_reason?: string | null;
  disposition_notes?: string | null;
  disposition_at?: string | null;
  disposition_by?: string | null;
}

export interface FollowUpWithCompany extends FollowUpRecord {
  companyName: string;
}

export interface FollowUpEnriched extends FollowUpWithCompany {
  contactName: string | null;
  contactId: string | null;
  companyPriority: CompanyPriority;
  companyAccountStatus: AccountStatus;
  /** Canonical company owner from companies.user_id */
  companyOwnerUserId: string | null;
  brokerName: string | null;
  brokerEmail: string | null;
  dispositionByName?: string | null;
  /** Present for completed follow-ups when an outcome activity exists. */
  completionOutcome?: "successful_contact" | "no_response" | null;
  /** Due date of the successor follow-up created after completion, if any. */
  nextFollowUpDueAt?: string | null;
}

export interface FollowUpWorkcenterData {
  pending: FollowUpEnriched[];
  completed: FollowUpEnriched[];
}

export function isDueThisWeek(dueAt: string): boolean {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;

  const { start, end } = getWeekBounds();
  return due >= start && due <= end;
}

export function isCompletedThisWeek(completedAt: string | null): boolean {
  if (!completedAt) return false;

  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return false;

  const { start, end } = getWeekBounds();
  return completed >= start && completed <= end;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

interface CompanyJoinRow {
  id: string;
  name: string;
  priority: CompanyPriority;
  user_id: string;
  account_status: string | null;
}

interface ContactJoinRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  is_primary: boolean;
}

interface ProfileJoinRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

function formatContactName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildPrimaryContactByCompany(
  contacts: ContactJoinRow[],
): Map<string, { id: string; name: string }> {
  const byCompany = new Map<string, ContactJoinRow[]>();

  for (const contact of contacts) {
    const existing = byCompany.get(contact.company_id) ?? [];
    existing.push(contact);
    byCompany.set(contact.company_id, existing);
  }

  const result = new Map<string, { id: string; name: string }>();

  for (const [companyId, companyContacts] of byCompany) {
    const primary =
      companyContacts.find((contact) => contact.is_primary) ??
      companyContacts[0];

    if (primary) {
      result.set(companyId, {
        id: primary.id,
        name: formatContactName(primary.first_name, primary.last_name),
      });
    }
  }

  return result;
}

/**
 * Companies assigned to this user. Administrators use the same personal
 * scope here. Cross-broker oversight stays in the dedicated admin modules.
 */
async function resolvePersonalFollowUpCompanyScope(userId: string): Promise<{
  ownedCompanyIds: Set<string>;
  error: { message?: string; code?: string; details?: string } | null;
}> {
  const { data, error } = await fetchOwnedCompanyIdsForViewer(userId);

  if (error) {
    logFollowUpsQueryError("resolvePersonalFollowUpCompanyScope", error);
    return { ownedCompanyIds: new Set(), error };
  }

  return { ownedCompanyIds: new Set(data), error: null };
}

function getProfileDisplayName(profile: ProfileJoinRow): string {
  return profile.full_name?.trim() || profile.email?.trim() || profile.id;
}

async function fetchCompaniesForFollowUps(
  companyIds: string[],
  userId: string,
  asAdmin: boolean,
): Promise<{
  data: CompanyJoinRow[];
  error: { message?: string } | null;
}> {
  if (companyIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await fetchCompanyRowsByIds(
    companyIds,
    "id, name, priority, user_id, account_status",
    asAdmin ? undefined : { userId, personalOnly: true },
  );

  if (error) {
    return { data: [], error };
  }

  return {
    data: enforceBrokerOwnedRows(data as unknown as CompanyJoinRow[], userId, {
      page: "fetchCompaniesForFollowUps",
      brokerFacingRoute: !asAdmin,
    }),
    error: null,
  };
}

async function fetchContactsForCompanies(
  companyIds: string[],
  userId: string,
  asAdmin: boolean,
): Promise<{
  data: ContactJoinRow[];
  error: { message?: string } | null;
}> {
  if (companyIds.length === 0) {
    return { data: [], error: null };
  }

  const rows: ContactJoinRow[] = [];

  for (let index = 0; index < companyIds.length; index += IN_FILTER_CHUNK_SIZE) {
    const chunk = companyIds.slice(index, index + IN_FILTER_CHUNK_SIZE);
    let offset = 0;

    while (true) {
      let query = supabase
        .from("contacts")
        .select("id, company_id, first_name, last_name, is_primary")
        .in("company_id", chunk)
        .order("id", { ascending: true })
        .range(offset, offset + FOLLOW_UP_PAGE_SIZE - 1);

      if (!asAdmin) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) {
        return { data: [], error };
      }

      const batch = (data as ContactJoinRow[]) ?? [];
      rows.push(...batch);
      if (batch.length < FOLLOW_UP_PAGE_SIZE) break;
      offset += FOLLOW_UP_PAGE_SIZE;
    }
  }

  return { data: rows, error: null };
}

async function fetchProfilesForUsers(
  userIds: string[],
): Promise<{
  data: ProfileJoinRow[];
  error: { message?: string } | null;
}> {
  if (userIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);

  return {
    data: (data as ProfileJoinRow[]) ?? [],
    error,
  };
}

function enrichFollowUpRows(
  rows: FollowUpRecord[],
  companyById: Map<string, CompanyJoinRow>,
  primaryContactByCompany: Map<string, { id: string; name: string }>,
  profileById: Map<string, ProfileJoinRow>,
): FollowUpEnriched[] {
  return rows.map((row) => {
    const company = companyById.get(row.company_id);
    const companyOwnerUserId = company?.user_id ?? null;
    const profile = companyOwnerUserId
      ? profileById.get(companyOwnerUserId)
      : null;
    const primaryContact = primaryContactByCompany.get(row.company_id);

    return {
      ...row,
      companyName: company?.name ?? "Unknown company",
      contactName: primaryContact?.name ?? null,
      contactId: primaryContact?.id ?? null,
      companyPriority: company?.priority ?? ("Medium" as CompanyPriority),
      companyAccountStatus: normalizeAccountStatus(company?.account_status),
      companyOwnerUserId,
      brokerName: profile ? getProfileDisplayName(profile) : null,
      brokerEmail: profile?.email ?? null,
      dispositionByName: null,
    };
  });
}

function filterPersonalFollowUpsToCompanyOwner(
  rows: FollowUpEnriched[],
  viewerUserId: string,
): FollowUpEnriched[] {
  return rows.filter((row) => row.companyOwnerUserId === viewerUserId);
}

async function enrichFollowUpRecords(
  rows: FollowUpRecord[],
  userId: string,
  asAdmin: boolean,
): Promise<{ data: FollowUpEnriched[]; error: { message?: string } | null }> {
  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const companyIds = [...new Set(rows.map((row) => row.company_id))];

  const [companiesResult, contactsResult] = await Promise.all([
    fetchCompaniesForFollowUps(companyIds, userId, asAdmin),
    fetchContactsForCompanies(companyIds, userId, asAdmin),
  ]);

  if (companiesResult.error) {
    return { data: [], error: companiesResult.error };
  }
  if (contactsResult.error) {
    return { data: [], error: contactsResult.error };
  }

  const companyById = new Map(
    companiesResult.data.map((company) => [company.id, company]),
  );
  const ownerIds = [
    ...new Set(
      companiesResult.data
        .map((company) => company.user_id)
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    ),
  ];
  const { data: ownerProfiles, error: profilesError } =
    await fetchProfilesForUsers(ownerIds);

  if (profilesError) {
    return { data: [], error: profilesError };
  }

  const primaryContactByCompany = buildPrimaryContactByCompany(
    contactsResult.data,
  );
  const profileById = new Map(
    ownerProfiles.map((profile) => [profile.id, profile]),
  );

  const enriched = enrichFollowUpRows(
    rows,
    companyById,
    primaryContactByCompany,
    profileById,
  );

  return {
    data: asAdmin
      ? enriched
      : filterPersonalFollowUpsToCompanyOwner(enriched, userId),
    error: null,
  };
}

async function fetchCompletedOutcomeMeta(
  followUpIds: string[],
): Promise<{
  outcomeByFollowUpId: Map<string, "successful_contact" | "no_response">;
  nextDueBySourceId: Map<string, string>;
  error: { message?: string } | null;
}> {
  const outcomeByFollowUpId = new Map<
    string,
    "successful_contact" | "no_response"
  >();
  const nextDueBySourceId = new Map<string, string>();

  if (followUpIds.length === 0) {
    return { outcomeByFollowUpId, nextDueBySourceId, error: null };
  }

  for (
    let index = 0;
    index < followUpIds.length;
    index += IN_FILTER_CHUNK_SIZE
  ) {
    const chunk = followUpIds.slice(index, index + IN_FILTER_CHUNK_SIZE);

    const [activitiesResult, successorsResult] = await Promise.all([
      supabase
        .from("activities")
        .select("follow_up_id, activity_type, activity_at")
        .in("follow_up_id", chunk)
        .in("activity_type", [
          "follow_up_no_response",
          "follow_up_rescheduled_contact",
        ])
        .order("activity_at", { ascending: false }),
      supabase
        .from("follow_ups")
        .select("source_follow_up_id, due_at")
        .in("source_follow_up_id", chunk),
    ]);

    if (activitiesResult.error) {
      return {
        outcomeByFollowUpId,
        nextDueBySourceId,
        error: activitiesResult.error,
      };
    }

    if (successorsResult.error) {
      return {
        outcomeByFollowUpId,
        nextDueBySourceId,
        error: successorsResult.error,
      };
    }

    for (const row of activitiesResult.data ?? []) {
      const followUpId = row.follow_up_id as string | null;
      if (!followUpId || outcomeByFollowUpId.has(followUpId)) continue;

      if (row.activity_type === "follow_up_no_response") {
        outcomeByFollowUpId.set(followUpId, "no_response");
      } else if (row.activity_type === "follow_up_rescheduled_contact") {
        outcomeByFollowUpId.set(followUpId, "successful_contact");
      }
    }

    for (const row of successorsResult.data ?? []) {
      const sourceId = row.source_follow_up_id as string | null;
      const dueAt = row.due_at as string | null;
      if (!sourceId || !dueAt || nextDueBySourceId.has(sourceId)) continue;
      nextDueBySourceId.set(sourceId, dueAt);
    }
  }

  return { outcomeByFollowUpId, nextDueBySourceId, error: null };
}

async function enrichCompletedFollowUpRecords(
  rows: FollowUpRecord[],
  userId: string,
  asAdmin: boolean,
): Promise<{ data: FollowUpEnriched[]; error: { message?: string } | null }> {
  const base = await enrichFollowUpRecords(rows, userId, asAdmin);
  if (base.error) {
    return base;
  }

  const { outcomeByFollowUpId, nextDueBySourceId, error } =
    await fetchCompletedOutcomeMeta(base.data.map((row) => row.id));

  if (error) {
    // Soft-fail: still show completed items; omit outcome / next-follow-up meta.
    logFollowUpsQueryError("enrichCompletedFollowUpRecords:meta", error);
    return { data: base.data, error: null };
  }

  return {
    data: base.data.map((row) => ({
      ...row,
      completionOutcome: outcomeByFollowUpId.get(row.id) ?? null,
      nextFollowUpDueAt: nextDueBySourceId.get(row.id) ?? null,
    })),
    error: null,
  };
}

export interface CreateFollowUpInput {
  userId: string;
  companyId: string;
  title: string;
  notes?: string | null;
  dueAt: string;
  typeFields?: FollowUpTypeFormValues;
  sourceFollowUpId?: string | null;
  contactId?: string | null;
}

export async function fetchPendingFollowUpsForCompany(
  companyId: string,
  ownerUserId: string,
  asAdmin = false,
): Promise<{ data: FollowUpRecord[]; error: { message?: string } | null }> {
  let query = supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  if (!asAdmin) {
    query = query.eq("user_id", ownerUserId);
  }

  const { data, error } = await query;

  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
  };
}

async function fetchFollowUpPage(input: {
  from: number;
  to: number;
  status: FollowUpStatus;
  userId?: string;
  companyIds?: string[];
  completedFrom?: string;
  completedTo?: string;
  orderBy: "due_at" | "completed_at" | "disposition_at";
  ascending: boolean;
}): Promise<{
  data: FollowUpRecord[];
  error: { message?: string; code?: string; details?: string } | null;
}> {
  let query = supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("status", input.status)
    .order(input.orderBy, { ascending: input.ascending })
    .order("id", { ascending: true })
    .range(input.from, input.to);

  if (input.userId) {
    query = query.eq("user_id", input.userId);
  }

  if (input.companyIds) {
    query = query.in("company_id", input.companyIds);
  }

  if (input.completedFrom) {
    query = query.gte("completed_at", input.completedFrom);
  }

  if (input.completedTo) {
    query = query.lte("completed_at", input.completedTo);
  }

  const { data, error } = await query;
  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
  };
}

/**
 * Load every matching follow-up. Do not cap this with a global LIMIT:
 * the oldest pending rows are overdue, so a short page hides every
 * follow-up that is due today or upcoming.
 */
async function fetchAllFollowUpRows(input: {
  status: FollowUpStatus;
  userId?: string;
  companyIds?: string[] | null;
  completedFrom?: string;
  completedTo?: string;
  orderBy: "due_at" | "completed_at" | "disposition_at";
  ascending: boolean;
}): Promise<{
  data: FollowUpRecord[];
  error: { message?: string; code?: string; details?: string } | null;
}> {
  if (input.companyIds && input.companyIds.length === 0) {
    return { data: [], error: null };
  }

  const companyChunks = input.companyIds
    ? Array.from(
        { length: Math.ceil(input.companyIds.length / IN_FILTER_CHUNK_SIZE) },
        (_, index) =>
          input.companyIds!.slice(
            index * IN_FILTER_CHUNK_SIZE,
            (index + 1) * IN_FILTER_CHUNK_SIZE,
          ),
      )
    : [undefined];

  const rows: FollowUpRecord[] = [];

  for (const companyIds of companyChunks) {
    let offset = 0;

    while (true) {
      const { data, error } = await fetchFollowUpPage({
        from: offset,
        to: offset + FOLLOW_UP_PAGE_SIZE - 1,
        status: input.status,
        userId: input.userId,
        companyIds,
        completedFrom: input.completedFrom,
        completedTo: input.completedTo,
        orderBy: input.orderBy,
        ascending: input.ascending,
      });

      if (error) {
        return { data: [], error };
      }

      rows.push(...data);
      if (data.length < FOLLOW_UP_PAGE_SIZE) break;
      offset += FOLLOW_UP_PAGE_SIZE;
    }
  }

  return { data: rows, error: null };
}

async function fetchPersonalFollowUpsByStatus(input: {
  userId: string;
  status: FollowUpStatus;
  orderBy: "due_at" | "completed_at" | "disposition_at";
  ascending: boolean;
  completedFrom?: string;
  completedTo?: string;
  limit?: number;
}): Promise<{
  data: FollowUpRecord[];
  error: { message?: string; code?: string; details?: string } | null;
}> {
  const { ownedCompanyIds, error: scopeError } =
    await resolvePersonalFollowUpCompanyScope(input.userId);

  if (scopeError) {
    return { data: [], error: scopeError };
  }

  const result = await fetchAllFollowUpRows({
    status: input.status,
    companyIds: [...ownedCompanyIds],
    completedFrom: input.completedFrom,
    completedTo: input.completedTo,
    orderBy: input.orderBy,
    ascending: input.ascending,
  });

  if (result.error) {
    return result;
  }

  const assigned = selectFollowUpsForAssignedCompanies(
    result.data,
    ownedCompanyIds,
  );
  const sorted = [...assigned].sort((left, right) => {
    const leftTime = new Date(left[input.orderBy] ?? left.due_at).getTime();
    const rightTime = new Date(right[input.orderBy] ?? right.due_at).getTime();
    return input.ascending ? leftTime - rightTime : rightTime - leftTime;
  });

  return {
    data: input.limit ? sorted.slice(0, input.limit) : sorted,
    error: null,
  };
}

/**
 * Pending follow-ups for companies assigned to this user.
 * The company filter is part of the database query. Administrator role
 * does not widen it. Dashboard and Follow-ups Work Center both use this.
 */
export async function fetchPendingFollowUpsForUser(
  userId: string,
): Promise<{ data: FollowUpRecord[]; error: { message?: string } | null }> {
  const result = await fetchPersonalFollowUpsByStatus({
    userId,
    status: "pending",
    orderBy: "due_at",
    ascending: true,
  });

  if (result.error) {
    return result;
  }

  const suppression = await fetchSuppressionIndex(supabase, { userId });
  if (suppression.error) {
    return { data: [], error: suppression.error };
  }

  return {
    data: result.data.filter(
      (followUp) =>
        isPendingFollowUpStatus(followUp.status) &&
        !isFollowUpOutreachSuppressed(suppression.index, followUp),
    ),
    error: null,
  };
}

export async function fetchPendingFollowUpsWithCompanies(
  userId: string,
): Promise<{
  data: FollowUpWithCompany[];
  error: { message?: string } | null;
}> {
  const { data: rows, error: followUpError } =
    await fetchPendingFollowUpsForUser(userId);

  if (followUpError) {
    return { data: [], error: followUpError };
  }

  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const companyIds = [...new Set(rows.map((row) => row.company_id))];

  if (companyIds.length === 0) {
    return {
      data: rows.map((row) => ({
        ...row,
        companyName: "Unknown company",
      })),
      error: null,
    };
  }

  const { data: companies, error: companyError } = await fetchCompanyRowsByIds(
    companyIds,
    "id, name",
    { userId, personalOnly: true },
  );

  if (companyError) {
    return { data: [], error: companyError };
  }

  const companyNameById = new Map(
    companies.map((company) => [company.id as string, company.name as string]),
  );

  return {
    data: rows.map((row) => ({
      ...row,
      companyName: companyNameById.get(row.company_id) ?? "Unknown company",
    })),
    error: null,
  };
}

export async function fetchFollowUpWorkcenterData(
  userId: string,
): Promise<{
  data: FollowUpWorkcenterData;
  error: { message?: string } | null;
}> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();

  const [pendingResult, completedResult] = await Promise.all([
    fetchPendingFollowUpsForUser(userId),
    fetchPersonalFollowUpsByStatus({
      userId,
      status: "completed",
      completedFrom: weekStart.toISOString(),
      completedTo: weekEnd.toISOString(),
      orderBy: "completed_at",
      ascending: false,
    }),
  ]);

  if (pendingResult.error) {
    logFollowUpsQueryError("fetchFollowUpWorkcenterData:pending", pendingResult.error);
    return {
      data: { pending: [], completed: [] },
      error: pendingResult.error,
    };
  }

  if (completedResult.error) {
    logFollowUpsQueryError("fetchFollowUpWorkcenterData:completed", completedResult.error);
    return {
      data: { pending: [], completed: [] },
      error: completedResult.error,
    };
  }

  const pendingRows = pendingResult.data;
  const completedRows = completedResult.data;

  const [pendingEnriched, completedEnriched] = await Promise.all([
    enrichFollowUpRecords(pendingRows, userId, false),
    enrichCompletedFollowUpRecords(completedRows, userId, false),
  ]);

  if (pendingEnriched.error) {
    return {
      data: { pending: [], completed: [] },
      error: pendingEnriched.error,
    };
  }

  if (completedEnriched.error) {
    return {
      data: { pending: [], completed: [] },
      error: completedEnriched.error,
    };
  }

  return {
    data: {
      pending: pendingEnriched.data,
      completed: completedEnriched.data,
    },
    error: null,
  };
}

export async function fetchCancelledFollowUps(
  userId: string,
): Promise<{
  data: FollowUpEnriched[];
  error: { message?: string } | null;
}> {
  const { data, error } = await fetchPersonalFollowUpsByStatus({
    userId,
    status: "cancelled",
    orderBy: "due_at",
    ascending: false,
    limit: FOLLOW_UP_COMPLETED_LIMIT,
  });

  if (error) {
    logFollowUpsQueryError("fetchCancelledFollowUps", error);
    return { data: [], error };
  }

  return enrichFollowUpRecords(data, userId, false);
}

async function attachDispositionActors(
  rows: FollowUpEnriched[],
): Promise<FollowUpEnriched[]> {
  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.disposition_by)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];

  if (actorIds.length === 0) {
    return rows;
  }

  const { data: profiles } = await fetchProfilesForUsers(actorIds);
  const nameById = new Map(
    profiles.map((profile) => [profile.id, getProfileDisplayName(profile)]),
  );

  return rows.map((row) => ({
    ...row,
    dispositionByName: row.disposition_by
      ? nameById.get(row.disposition_by) ?? null
      : null,
  }));
}

export async function fetchDoNotFollowUpFollowUps(
  userId: string,
): Promise<{
  data: FollowUpEnriched[];
  error: { message?: string } | null;
}> {
  const { data, error } = await fetchPersonalFollowUpsByStatus({
    userId,
    status: "do_not_follow_up",
    orderBy: "disposition_at",
    ascending: false,
    limit: FOLLOW_UP_COMPLETED_LIMIT,
  });

  if (error) {
    logFollowUpsQueryError("fetchDoNotFollowUpFollowUps", error);
    return { data: [], error };
  }

  const enriched = await enrichFollowUpRecords(data, userId, false);
  if (enriched.error) {
    return enriched;
  }

  return {
    data: await attachDispositionActors(enriched.data),
    error: null,
  };
}

export async function fetchDoNotFollowUpFollowUpsForCompany(
  companyId: string,
  ownerUserId: string,
  asAdmin = false,
): Promise<{
  data: FollowUpRecord[];
  error: { message?: string } | null;
}> {
  let query = supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("company_id", companyId)
    .eq("status", "do_not_follow_up")
    .order("disposition_at", { ascending: false })
    .limit(FOLLOW_UP_COMPLETED_LIMIT);

  if (!asAdmin) {
    query = query.eq("user_id", ownerUserId);
  }

  const { data, error } = await query;

  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
  };
}

export async function createFollowUp(
  input: CreateFollowUpInput,
): Promise<{
  error: { message?: string; code?: string } | null;
  followUpId: string | null;
}> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("user_id")
    .eq("id", input.companyId)
    .maybeSingle();

  if (companyError) {
    return { error: companyError, followUpId: null };
  }

  if (!company?.user_id) {
    return { error: { message: "Company not found." }, followUpId: null };
  }

  const ownerUserId = company.user_id as string;
  const contactId = input.contactId?.trim() || null;

  if (contactId) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, company_id")
      .eq("id", contactId)
      .eq("company_id", input.companyId)
      .maybeSingle();

    if (contactError) {
      return { error: contactError, followUpId: null };
    }

    if (!contact) {
      return {
        error: { message: "Contact does not belong to this company." },
        followUpId: null,
      };
    }
  }

  const block = await followUpCreateBlockMessage(supabase, {
    companyId: input.companyId,
    contactId,
  });

  if (block.error) {
    return { error: block.error, followUpId: null };
  }

  if (block.message) {
    return { error: { message: block.message }, followUpId: null };
  }

  const seasonalFields = input.typeFields
    ? resolveFollowUpSeasonalFields(input.typeFields, input.dueAt)
    : resolveFollowUpSeasonalFields(
        { followUpType: "regular", reminderLeadDays: 30, seasonalContext: "" },
        input.dueAt,
      );

  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      user_id: ownerUserId,
      company_id: input.companyId,
      contact_id: contactId,
      title: input.title,
      notes: input.notes ?? null,
      due_at: input.dueAt,
      status: "pending" as FollowUpStatus,
      source_follow_up_id: input.sourceFollowUpId ?? null,
      ...seasonalFields,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { error, followUpId: null };
  }

  const syncResult = await syncCompanyNextFollowUpAt(
    input.companyId,
    ownerUserId,
  );

  if (syncResult.error) {
    return { error: syncResult.error, followUpId: data?.id ?? null };
  }

  return { error: null, followUpId: data?.id ?? null };
}

export async function syncCompanyNextFollowUpAt(
  companyId: string,
  userId: string,
): Promise<{ error: { message?: string } | null }> {
  const { data: nextFollowUp, error: fetchError } = await supabase
    .from("follow_ups")
    .select("due_at")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError };
  }

  const { error } = await supabase
    .from("companies")
    .update({ next_follow_up_at: nextFollowUp?.due_at ?? null })
    .eq("id", companyId)
    .eq("user_id", userId);

  return { error };
}

export interface MarkFollowUpCompletedResult {
  error: { message?: string; code?: string } | null;
  alreadyCompleted: boolean;
  completedAt: string | null;
  /** Assignee stored on the row. Completion does not change it. */
  assigneeUserId: string | null;
}

interface CompletionRow {
  id: string;
  status: string;
  completed_at: string | null;
  user_id: string;
}

function completionSaved(
  row: Pick<CompletionRow, "status" | "completed_at"> | null,
): boolean {
  return row?.status === "completed" && Boolean(row.completed_at);
}

function missingCompleteFollowUpRpc(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST202") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("complete_follow_up") &&
    (message.includes("could not find") ||
      message.includes("does not exist") ||
      message.includes("schema cache"))
  );
}

/**
 * Sets status to completed and writes completed_at for one follow-up.
 * A zero-row update is not success: the row is re-read, and company owners
 * can finish the write through complete_follow_up when follow_ups.user_id
 * does not match the broker who can already see the row.
 */
export async function markFollowUpCompleted(input: {
  followUpId: string;
  companyId: string;
  asAdmin?: boolean;
}): Promise<MarkFollowUpCompletedResult> {
  const empty: MarkFollowUpCompletedResult = {
    error: null,
    alreadyCompleted: false,
    completedAt: null,
    assigneeUserId: null,
  };

  const { data: current, error: fetchError } = await supabase
    .from("follow_ups")
    .select("id, status, completed_at, user_id")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (fetchError) {
    return { ...empty, error: fetchError };
  }

  if (!current) {
    return { ...empty, error: { message: "Follow-up not found." } };
  }

  const row = current as CompletionRow;

  if (row.status === "completed" && row.completed_at) {
    return {
      error: null,
      alreadyCompleted: true,
      completedAt: row.completed_at,
      assigneeUserId: row.user_id,
    };
  }

  if (!isPendingFollowUpStatus(row.status) && row.status !== "completed") {
    return {
      ...empty,
      assigneeUserId: row.user_id,
      error: { message: "Only pending follow-ups can be completed." },
    };
  }

  const completedAt = new Date().toISOString();
  let updateQuery = supabase
    .from("follow_ups")
    .update({
      status: "completed" as FollowUpStatus,
      completed_at: completedAt,
    })
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .eq("status", "pending");

  if (!input.asAdmin) {
    updateQuery = updateQuery.eq("user_id", row.user_id);
  }

  const { data: updated, error: updateError } = await updateQuery
    .select("id, status, completed_at, user_id")
    .maybeSingle();

  if (updateError) {
    return { ...empty, assigneeUserId: row.user_id, error: updateError };
  }

  if (completionSaved(updated as CompletionRow | null)) {
    const saved = updated as CompletionRow;
    return {
      error: null,
      alreadyCompleted: false,
      completedAt: saved.completed_at,
      assigneeUserId: saved.user_id,
    };
  }

  const { data: reread, error: rereadError } = await supabase
    .from("follow_ups")
    .select("id, status, completed_at, user_id")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (rereadError) {
    return { ...empty, assigneeUserId: row.user_id, error: rereadError };
  }

  if (completionSaved(reread as CompletionRow | null)) {
    const saved = reread as CompletionRow;
    return {
      error: null,
      alreadyCompleted: true,
      completedAt: saved.completed_at,
      assigneeUserId: saved.user_id,
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "complete_follow_up",
    {
      p_follow_up_id: input.followUpId,
      p_company_id: input.companyId,
    },
  );

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const payload = rpcData as {
      status?: string;
      completedAt?: string | null;
      alreadyCompleted?: boolean;
    };
    if (payload.status === "completed" && payload.completedAt) {
      return {
        error: null,
        alreadyCompleted: Boolean(payload.alreadyCompleted),
        completedAt: payload.completedAt,
        assigneeUserId: row.user_id,
      };
    }
  }

  if (rpcError && !missingCompleteFollowUpRpc(rpcError)) {
    return { ...empty, assigneeUserId: row.user_id, error: rpcError };
  }

  return {
    ...empty,
    assigneeUserId: row.user_id,
    error: {
      message: "Follow-up could not be marked complete. It is still open.",
    },
  };
}

export async function completeFollowUp(
  followUpId: string,
  ownerUserId: string,
  companyId: string,
  asAdmin = false,
): Promise<{ error: { message?: string } | null }> {
  const marked = await markFollowUpCompleted({
    followUpId,
    companyId,
    asAdmin,
  });

  if (marked.error) {
    return { error: marked.error };
  }

  return syncCompanyNextFollowUpAt(companyId, ownerUserId);
}

export interface RescheduleFollowUpInput {
  followUpId: string;
  ownerUserId: string;
  companyId: string;
  dueAt: string;
  title?: string;
  notes?: string | null;
  typeFields?: FollowUpTypeFormValues;
  asAdmin?: boolean;
}

export async function rescheduleFollowUp(
  input: RescheduleFollowUpInput,
): Promise<{ error: { message?: string } | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("follow_ups")
    .select("status")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError };
  }

  if (!existing) {
    return { error: { message: "Follow-up not found." } };
  }

  if (existing.status === "do_not_follow_up") {
    return {
      error: {
        message:
          "This follow-up was closed with Do Not Follow Up and cannot be rescheduled.",
      },
    };
  }

  const updates: Record<string, string | number | null> = {
    due_at: input.dueAt,
    status: "pending",
  };

  if (input.title !== undefined) {
    updates.title = input.title.trim();
  }

  if (input.notes !== undefined) {
    updates.notes = input.notes?.trim() || null;
  }

  if (input.typeFields) {
    Object.assign(
      updates,
      resolveFollowUpSeasonalFields(input.typeFields, input.dueAt),
    );
  }

  let query = supabase
    .from("follow_ups")
    .update(updates)
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId);

  if (!input.asAdmin) {
    query = query.eq("user_id", input.ownerUserId);
  }

  const { error } = await query;

  if (error) {
    return { error };
  }

  return syncCompanyNextFollowUpAt(input.companyId, input.ownerUserId);
}

export interface CreateActivityNoteInput {
  userId: string;
  companyId: string;
  /** Company owner used for commercial date sync. Defaults to userId. */
  ownerUserId?: string;
  notes: string;
  subject?: string | null;
  activityType?: ActivityType;
}

export async function createActivityNote(
  input: CreateActivityNoteInput,
): Promise<{ error: { message?: string } | null }> {
  const trimmedNotes = input.notes.trim();
  if (!trimmedNotes) {
    return { error: { message: "Activity notes are required." } };
  }

  const { error } = await supabase.from("activities").insert({
    user_id: input.userId,
    company_id: input.companyId,
    activity_type: input.activityType ?? "note",
    subject: input.subject?.trim() || "Follow-up contact",
    notes: trimmedNotes,
    activity_at: new Date().toISOString(),
  });

  if (error) {
    return { error };
  }

  return syncCompanyCommercialDates(
    input.companyId,
    input.ownerUserId ?? input.userId,
  );
}

export async function syncCompanyCommercialDates(
  companyId: string,
  ownerUserId: string,
): Promise<{ error: { message?: string } | null }> {
  // Activities may be logged by brokers or admins acting on the account.
  const { data: latestActivities, error: activityError } = await supabase
    .from("activities")
    .select("activity_at, activity_type")
    .eq("company_id", companyId)
    .order("activity_at", { ascending: false })
    .limit(25);

  if (activityError) {
    return { error: activityError };
  }

  const latestSuccessfulContact = (latestActivities ?? []).find((activity) =>
    updatesLastContactAt(activity.activity_type),
  );

  const { data: nextFollowUp, error: followUpError } = await supabase
    .from("follow_ups")
    .select("due_at")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (followUpError) {
    return { error: followUpError };
  }

  const { error } = await supabase
    .from("companies")
    .update({
      last_contact_at: latestSuccessfulContact?.activity_at ?? null,
      next_follow_up_at: nextFollowUp?.due_at ?? null,
    })
    .eq("id", companyId)
    .eq("user_id", ownerUserId);

  return { error };
}

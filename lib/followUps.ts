import {
  normalizeAccountStatus,
  type AccountStatus,
} from "@/lib/accountStatus";
import type { ActivityType, CompanyPriority, FollowUpStatus } from "@/lib/crmConstants";
import {
  resolveFollowUpSeasonalFields,
  type FollowUpType,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import { enforceBrokerOwnedRows, fetchOwnedCompanyIdsForViewer } from "@/lib/brokerDataAccess";
import { supabase } from "@/lib/supabaseClient";

const IN_FILTER_CHUNK_SIZE = 80;

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

export const FOLLOW_UP_PENDING_LIMIT = 200;
export const FOLLOW_UP_COMPLETED_LIMIT = 100;

export type { FollowUpStatus };

export const FOLLOW_UP_SELECT_FIELDS =
  "id, user_id, company_id, title, notes, due_at, status, completed_at, created_at, follow_up_type, reminder_lead_days, reminder_start_date, seasonal_context";

export interface FollowUpRecord {
  id: string;
  user_id: string;
  company_id: string;
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
}

export interface FollowUpWithCompany extends FollowUpRecord {
  companyName: string;
}

export interface FollowUpEnriched extends FollowUpWithCompany {
  contactName: string | null;
  companyPriority: CompanyPriority;
  companyAccountStatus: AccountStatus;
  brokerName: string | null;
  brokerEmail: string | null;
}

export interface FollowUpWorkcenterData {
  pending: FollowUpEnriched[];
  completed: FollowUpEnriched[];
}

export type FollowUpBucket = "overdue" | "today" | "upcoming";

export function getDayBounds(reference: Date = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getFollowUpBucket(dueAt: string): FollowUpBucket {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "upcoming";

  const { start, end } = getDayBounds();

  if (due < start) return "overdue";
  if (due <= end) return "today";
  return "upcoming";
}

export function bucketFollowUpsWithCompanies<T extends FollowUpWithCompany>(
  followUps: T[],
): Record<FollowUpBucket, T[]> {
  const overdue: T[] = [];
  const today: T[] = [];
  const upcoming: T[] = [];

  for (const followUp of followUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "overdue") overdue.push(followUp);
    else if (bucket === "today") today.push(followUp);
    else upcoming.push(followUp);
  }

  const byDueAsc = (a: T, b: T) =>
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime();

  overdue.sort(byDueAsc);
  today.sort(byDueAsc);
  upcoming.sort(byDueAsc);

  return { overdue, today, upcoming };
}

export function getWeekBounds(reference: Date = new Date()) {
  const start = new Date(reference);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
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

function buildContactNameByCompany(
  contacts: ContactJoinRow[],
): Map<string, string> {
  const byCompany = new Map<string, ContactJoinRow[]>();

  for (const contact of contacts) {
    const existing = byCompany.get(contact.company_id) ?? [];
    existing.push(contact);
    byCompany.set(contact.company_id, existing);
  }

  const result = new Map<string, string>();

  for (const [companyId, companyContacts] of byCompany) {
    const primary =
      companyContacts.find((contact) => contact.is_primary) ??
      companyContacts[0];

    if (primary) {
      result.set(
        companyId,
        formatContactName(primary.first_name, primary.last_name),
      );
    }
  }

  return result;
}

function filterFollowUpsToOwnedCompanies(
  rows: FollowUpRecord[],
  ownedCompanyIds: Set<string>,
): FollowUpRecord[] {
  return rows.filter((row) => ownedCompanyIds.has(row.company_id));
}

async function resolvePersonalFollowUpCompanyScope(
  userId: string,
  asAdmin: boolean,
): Promise<{
  ownedCompanyIds: Set<string> | null;
  error: { message?: string; code?: string; details?: string } | null;
}> {
  if (asAdmin) {
    return { ownedCompanyIds: null, error: null };
  }

  const { data, error } = await fetchOwnedCompanyIdsForViewer(userId);

  if (error) {
    logFollowUpsQueryError("resolvePersonalFollowUpCompanyScope", error);
    return { ownedCompanyIds: null, error };
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

  let query = supabase
    .from("contacts")
    .select("company_id, first_name, last_name, is_primary")
    .in("company_id", companyIds);

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  return {
    data: (data as ContactJoinRow[]) ?? [],
    error,
  };
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
  contactNameByCompany: Map<string, string>,
  profileById: Map<string, ProfileJoinRow>,
): FollowUpEnriched[] {
  return rows.map((row) => {
    const company = companyById.get(row.company_id);
    const profile = profileById.get(row.user_id);

    return {
      ...row,
      companyName: company?.name ?? "Unknown company",
      contactName: contactNameByCompany.get(row.company_id) ?? null,
      companyPriority: company?.priority ?? ("Medium" as CompanyPriority),
      companyAccountStatus: normalizeAccountStatus(company?.account_status),
      brokerName: profile ? getProfileDisplayName(profile) : null,
      brokerEmail: profile?.email ?? null,
    };
  });
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
  const ownerIds = [...new Set(rows.map((row) => row.user_id))];

  const [companiesResult, contactsResult, profilesResult] = await Promise.all([
    fetchCompaniesForFollowUps(companyIds, userId, asAdmin),
    fetchContactsForCompanies(companyIds, userId, asAdmin),
    asAdmin ? fetchProfilesForUsers(ownerIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (companiesResult.error) {
    return { data: [], error: companiesResult.error };
  }
  if (contactsResult.error) {
    return { data: [], error: contactsResult.error };
  }
  if (profilesResult.error) {
    return { data: [], error: profilesResult.error };
  }

  const companyById = new Map(
    companiesResult.data.map((company) => [company.id, company]),
  );
  const contactNameByCompany = buildContactNameByCompany(contactsResult.data);
  const profileById = new Map(
    profilesResult.data.map((profile) => [profile.id, profile]),
  );

  return {
    data: enrichFollowUpRows(
      rows,
      companyById,
      contactNameByCompany,
      profileById,
    ),
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

export async function fetchPendingFollowUpsForUser(
  userId: string,
): Promise<{ data: FollowUpRecord[]; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
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
  asAdmin = false,
): Promise<{
  data: FollowUpWorkcenterData;
  error: { message?: string } | null;
}> {
  const { start: weekStart } = getWeekBounds();

  const { ownedCompanyIds, error: scopeError } =
    await resolvePersonalFollowUpCompanyScope(userId, asAdmin);

  if (scopeError) {
    return {
      data: { pending: [], completed: [] },
      error: scopeError,
    };
  }

  if (ownedCompanyIds && ownedCompanyIds.size === 0) {
    return {
      data: { pending: [], completed: [] },
      error: null,
    };
  }

  let pendingQuery = supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(FOLLOW_UP_PENDING_LIMIT);

  let completedQuery = supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("status", "completed")
    .gte("completed_at", weekStart.toISOString())
    .order("completed_at", { ascending: false })
    .limit(FOLLOW_UP_COMPLETED_LIMIT);

  const [pendingResult, completedResult] = await Promise.all([
    pendingQuery,
    completedQuery,
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

  const pendingRows = ownedCompanyIds
    ? filterFollowUpsToOwnedCompanies(
        (pendingResult.data as FollowUpRecord[]) ?? [],
        ownedCompanyIds,
      )
    : enforceBrokerOwnedRows(
        (pendingResult.data as FollowUpRecord[]) ?? [],
        userId,
        {
          page: "fetchFollowUpWorkcenterData:pending",
          brokerFacingRoute: !asAdmin,
        },
      );
  const completedRows = ownedCompanyIds
    ? filterFollowUpsToOwnedCompanies(
        (completedResult.data as FollowUpRecord[]) ?? [],
        ownedCompanyIds,
      )
    : enforceBrokerOwnedRows(
        (completedResult.data as FollowUpRecord[]) ?? [],
        userId,
        {
          page: "fetchFollowUpWorkcenterData:completed",
          brokerFacingRoute: !asAdmin,
        },
      );

  const [pendingEnriched, completedEnriched] = await Promise.all([
    enrichFollowUpRecords(pendingRows, userId, asAdmin),
    enrichFollowUpRecords(completedRows, userId, asAdmin),
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
  asAdmin = false,
): Promise<{
  data: FollowUpEnriched[];
  error: { message?: string } | null;
}> {
  const { ownedCompanyIds, error: scopeError } =
    await resolvePersonalFollowUpCompanyScope(userId, asAdmin);

  if (scopeError) {
    return { data: [], error: scopeError };
  }

  if (ownedCompanyIds && ownedCompanyIds.size === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(FOLLOW_UP_COMPLETED_LIMIT);

  if (error) {
    logFollowUpsQueryError("fetchCancelledFollowUps", error);
    return { data: [], error };
  }

  const rows = ownedCompanyIds
    ? filterFollowUpsToOwnedCompanies((data as FollowUpRecord[]) ?? [], ownedCompanyIds)
    : ((data as FollowUpRecord[]) ?? []);

  return enrichFollowUpRecords(rows, userId, asAdmin);
}

export async function createFollowUp(
  input: CreateFollowUpInput,
): Promise<{ error: { message?: string } | null }> {
  const seasonalFields = input.typeFields
    ? resolveFollowUpSeasonalFields(input.typeFields, input.dueAt)
    : resolveFollowUpSeasonalFields(
        { followUpType: "regular", reminderLeadDays: 30, seasonalContext: "" },
        input.dueAt,
      );

  const { error } = await supabase.from("follow_ups").insert({
    user_id: input.userId,
    company_id: input.companyId,
    title: input.title,
    notes: input.notes ?? null,
    due_at: input.dueAt,
    status: "pending" as FollowUpStatus,
    ...seasonalFields,
  });

  if (error) {
    return { error };
  }

  return syncCompanyNextFollowUpAt(input.companyId, input.userId);
}

export async function syncCompanyNextFollowUpAt(
  companyId: string,
  userId: string,
): Promise<{ error: { message?: string } | null }> {
  const { data: nextFollowUp, error: fetchError } = await supabase
    .from("follow_ups")
    .select("due_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
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

export async function completeFollowUp(
  followUpId: string,
  ownerUserId: string,
  companyId: string,
  asAdmin = false,
): Promise<{ error: { message?: string } | null }> {
  let query = supabase
    .from("follow_ups")
    .update({
      status: "completed" as FollowUpStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", followUpId)
    .eq("company_id", companyId);

  if (!asAdmin) {
    query = query.eq("user_id", ownerUserId);
  }

  const { error } = await query;

  if (error) {
    return { error };
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

  return syncCompanyCommercialDates(input.companyId, input.userId);
}

export async function syncCompanyCommercialDates(
  companyId: string,
  userId: string,
): Promise<{ error: { message?: string } | null }> {
  const { data: latestActivity, error: activityError } = await supabase
    .from("activities")
    .select("activity_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .order("activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activityError) {
    return { error: activityError };
  }

  const { data: nextFollowUp, error: followUpError } = await supabase
    .from("follow_ups")
    .select("due_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
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
      last_contact_at: latestActivity?.activity_at ?? null,
      next_follow_up_at: nextFollowUp?.due_at ?? null,
    })
    .eq("id", companyId)
    .eq("user_id", userId);

  return { error };
}

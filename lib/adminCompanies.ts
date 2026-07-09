import { normalizeAccountStatus, type AccountStatus, type AccountStatusFilter } from "@/lib/accountStatus";
import { COMPANY_PRIORITIES, isOpenOpportunityStage } from "@/lib/crmConstants";
import {
  getOpportunityPipelineValue,
  isBrokerProductivityEligibleRole,
} from "@/lib/brokerProductivity";
import { getFollowUpBucket } from "@/lib/followUps";
import {
  getProfileDisplayName,
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";
import { verifyAdminAccess } from "@/lib/admin";
import {
  UNASSIGNED_OFFICE_LABEL,
  type Office,
} from "@/lib/offices";

const INACTIVITY_DAYS = 30;
export const OVERSIGHT_FETCH_PAGE_SIZE = 1000;

export type AdminCompanyLifecycleStatus = "active" | "archived" | "all";

export type AdminCompanySortOption =
  | "name_asc"
  | "name_desc"
  | "created_newest"
  | "created_oldest";

export type AdminCompanyAttentionStatus =
  | "all"
  | "overdue_follow_up"
  | "no_activity_30d"
  | "no_contacts"
  | "high_priority"
  | "has_open_opportunity";

export type AdminCompanyAttentionBadge =
  | "overdue_follow_up"
  | "due_today"
  | "no_activity_30d"
  | "no_contacts"
  | "high_priority"
  | "open_opportunity";

export interface AdminCompanyOversightRow {
  companyId: string;
  companyName: string;
  country: string | null;
  priority: string;
  brokerUserId: string;
  brokerName: string;
  brokerEmail: string;
  brokerOfficeId: string | null;
  brokerOfficeName: string;
  createdAt: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  contactCount: number;
  activityCount: number;
  openFollowUpCount: number;
  overdueFollowUpCount: number;
  dueTodayFollowUpCount: number;
  openOpportunityCount: number;
  openOpportunityValue: number;
  attentionBadges: AdminCompanyAttentionBadge[];
  isArchived: boolean;
  deletedAt: string | null;
  deleteReason: string | null;
  accountStatus: AccountStatus;
  accountDisposition: string | null;
}

export interface AdminCompaniesSummary {
  totalCompanies: number;
  highPriorityCompanies: number;
  companiesWithOverdueFollowUps: number;
  companiesNoActivity30d: number;
  companiesWithNoContacts: number;
}

export interface AdminCompaniesBrokerOption {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

export function formatAssignableOwnerLabel(
  owner: Pick<AdminCompaniesBrokerOption, "name" | "email" | "role">,
): string {
  const roleLabel =
    owner.role === "super_admin"
      ? "Super admin"
      : owner.role === "admin"
        ? "Admin"
        : "Broker";
  return `${owner.name} (${owner.email}) · ${roleLabel}`;
}

export interface AdminCompaniesOversightData {
  summary: AdminCompaniesSummary;
  companies: AdminCompanyOversightRow[];
  brokers: AdminCompaniesBrokerOption[];
  countries: string[];
  offices: Office[];
}

export const OVERSIGHT_TABLE_DEFAULT_PAGE_SIZE = 100;
export const OVERSIGHT_TABLE_PAGE_SIZES = [50, 100, 250] as const;
export const OVERSIGHT_SEARCH_DEBOUNCE_MS = 400;
export const OVERSIGHT_ATTENTION_ID_CHUNK_SIZE = 200;

export interface AdminCompaniesOversightFilters {
  search: string;
  brokerUserId: string;
  officeId: string;
  priority: string;
  country: string;
  attention: AdminCompanyAttentionStatus;
  lifecycle: AdminCompanyLifecycleStatus;
  accountStatus: AccountStatusFilter;
  sort: AdminCompanySortOption;
}

export interface AdminCompaniesOversightMeta {
  unfilteredSummary: AdminCompaniesSummary;
  brokers: AdminCompaniesBrokerOption[];
  countries: string[];
  offices: Office[];
}

export interface AdminCompaniesOversightPageData {
  companies: AdminCompanyOversightRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: AdminCompaniesSummary;
  ownerTotalCount: number | null;
}

type OversightProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean | null;
  is_blocked: boolean | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  office_id: string | null;
};

type RawOversightCompany = {
  id: string;
  user_id: string;
  name: string;
  country: string | null;
  priority: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
  account_status: string | null;
  account_disposition: string | null;
};

const EMPTY_SUMMARY: AdminCompaniesSummary = {
  totalCompanies: 0,
  highPriorityCompanies: 0,
  companiesWithOverdueFollowUps: 0,
  companiesNoActivity30d: 0,
  companiesWithNoContacts: 0,
};

const PROFILE_OVERSIGHT_SELECT =
  "id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason, office_id";

const COMPANY_OVERSIGHT_SELECT =
  "id, user_id, name, country, priority, last_contact_at, next_follow_up_at, created_at, deleted_at, delete_reason, account_status, account_disposition";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getStartOfTodayIso(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

function attentionFilterUsesCompanyIds(
  attention: AdminCompanyAttentionStatus,
): boolean {
  return (
    attention === "has_open_opportunity" ||
    attention === "overdue_follow_up" ||
    attention === "no_contacts"
  );
}

function resolveOfficeUserIds(
  officeId: string,
  profiles: OversightProfileRow[],
): string[] | null {
  if (officeId === "all") {
    return null;
  }

  if (officeId === "unassigned") {
    return profiles
      .filter((profile) => !profile.office_id)
      .map((profile) => profile.id);
  }

  return profiles
    .filter((profile) => profile.office_id === officeId)
    .map((profile) => profile.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOversightStructuralFilters(
  query: any,
  filters: AdminCompaniesOversightFilters,
  officeUserIds: string[] | null,
) {
  if (filters.lifecycle === "active") {
    query = query.is("deleted_at", null);
  } else if (filters.lifecycle === "archived") {
    query = query.not("deleted_at", "is", null);
  }

  if (filters.accountStatus === "working") {
    query = query.or(
      "account_status.eq.active,account_status.eq.paused,account_status.is.null",
    );
  } else if (filters.accountStatus !== "all") {
    query = query.eq("account_status", filters.accountStatus);
  }

  const normalizedSearch = filters.search.trim();
  if (normalizedSearch) {
    query = query.ilike("name", `%${normalizedSearch}%`);
  }

  if (filters.brokerUserId !== "all") {
    query = query.eq("user_id", filters.brokerUserId);
  }

  if (filters.country !== "all") {
    query = query.eq("country", filters.country);
  }

  if (filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }

  if (officeUserIds !== null) {
    if (officeUserIds.length === 0) {
      return query.in("id", ["00000000-0000-0000-0000-000000000001"]);
    }
    query = query.in("user_id", officeUserIds);
  }

  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDirectAttentionFilters(
  query: any,
  attention: AdminCompanyAttentionStatus,
) {
  switch (attention) {
    case "high_priority":
      return query.in("priority", ["High", "Hot Lead"]);
    case "no_activity_30d": {
      const cutoff = getInactivityCutoff().toISOString();
      return query.or(`last_contact_at.is.null,last_contact_at.lt.${cutoff}`);
    }
    default:
      return query;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOversightSort(query: any, sort: AdminCompanySortOption) {
  switch (sort) {
    case "name_asc":
      return query.order("name", { ascending: true }).order("id", { ascending: true });
    case "name_desc":
      return query
        .order("name", { ascending: false })
        .order("id", { ascending: true });
    case "created_newest":
      return query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
    case "created_oldest":
      return query
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
  }
}

function sortOversightCompanyRefs(
  rows: Array<{ id: string; name: string; created_at: string }>,
  sort: AdminCompanySortOption,
): Array<{ id: string; name: string; created_at: string }> {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "created_newest":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "created_oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });
  return sorted;
}

async function fetchOversightProfiles(): Promise<{
  data: OversightProfileRow[];
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_OVERSIGHT_SELECT);
  return { data: (data ?? []) as OversightProfileRow[], error };
}

async function fetchOversightOffices(): Promise<{
  data: Office[];
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("offices")
    .select("id, name, city, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data ?? []).map((office) => ({
      id: office.id,
      name: office.name,
      city: office.city,
      isActive: office.is_active ?? true,
    })),
    error: null,
  };
}

async function fetchOversightCountries(): Promise<{
  data: string[];
  error: { message?: string } | null;
}> {
  const countries = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("country")
      .not("country", "is", null)
      .order("country", { ascending: true })
      .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

    if (error) {
      return { data: [], error };
    }

    const batch = data ?? [];
    for (const row of batch) {
      const country = row.country?.trim();
      if (country) {
        countries.add(country);
      }
    }

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return {
    data: Array.from(countries).sort((a, b) => a.localeCompare(b)),
    error: null,
  };
}

async function fetchContactCompanyIdSet(): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("company_id")
      .order("company_id", { ascending: true })
      .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

    if (error) {
      break;
    }

    const batch = data ?? [];
    for (const row of batch) {
      ids.add(row.company_id);
    }

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return ids;
}

async function fetchOverdueFollowUpCompanyIds(): Promise<string[]> {
  const ids = new Set<string>();
  const todayStart = getStartOfTodayIso();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("follow_ups")
      .select("company_id")
      .eq("status", "pending")
      .lt("due_at", todayStart)
      .order("company_id", { ascending: true })
      .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

    if (error) {
      break;
    }

    const batch = data ?? [];
    for (const row of batch) {
      ids.add(row.company_id);
    }

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return Array.from(ids);
}

async function fetchOpenOpportunityCompanyIds(): Promise<string[]> {
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("load_opportunities")
      .select("company_id, status")
      .order("company_id", { ascending: true })
      .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

    if (error) {
      break;
    }

    const batch = data ?? [];
    for (const row of batch) {
      if (isOpenOpportunityStage(row.status)) {
        ids.add(row.company_id);
      }
    }

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return Array.from(ids);
}

async function fetchCompaniesByIds(
  companyIds: string[],
): Promise<RawOversightCompany[]> {
  if (companyIds.length === 0) {
    return [];
  }

  const rows: RawOversightCompany[] = [];

  for (const chunk of chunkArray(companyIds, OVERSIGHT_ATTENTION_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_OVERSIGHT_SELECT)
      .in("id", chunk);

    if (error) {
      continue;
    }

    rows.push(...((data ?? []) as RawOversightCompany[]));
  }

  const order = new Map(companyIds.map((id, index) => [id, index]));
  rows.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );

  return rows;
}

async function resolveAttentionCompanyIds(
  filters: AdminCompaniesOversightFilters,
  profiles: OversightProfileRow[],
): Promise<string[]> {
  const officeUserIds = resolveOfficeUserIds(filters.officeId, profiles);
  const structuralFilters = { ...filters, attention: "all" as const };

  switch (filters.attention) {
    case "has_open_opportunity": {
      const openIds = await fetchOpenOpportunityCompanyIds();
      if (openIds.length === 0) {
        return [];
      }

      const matched: string[] = [];
      for (const chunk of chunkArray(openIds, OVERSIGHT_ATTENTION_ID_CHUNK_SIZE)) {
        let query = supabase.from("companies").select("id");
        query = applyOversightStructuralFilters(
          query,
          structuralFilters,
          officeUserIds,
        );
        const { data } = await query.in("id", chunk);
        matched.push(...((data ?? []) as Array<{ id: string }>).map((row) => row.id));
      }
      return matched;
    }
    case "overdue_follow_up": {
      const candidateIds = new Set(await fetchOverdueFollowUpCompanyIds());
      const todayStart = getStartOfTodayIso();
      let offset = 0;

      while (true) {
        let query = supabase.from("companies").select("id");
        query = applyOversightStructuralFilters(
          query,
          structuralFilters,
          officeUserIds,
        );
        query = query
          .not("next_follow_up_at", "is", null)
          .lt("next_follow_up_at", todayStart);
        const { data, error } = await query
          .order("id", { ascending: true })
          .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

        if (error) {
          break;
        }

        const batch = data ?? [];
        for (const row of batch) {
          candidateIds.add(row.id);
        }

        if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
          break;
        }

        offset += OVERSIGHT_FETCH_PAGE_SIZE;
      }

      const matched: string[] = [];
      for (const chunk of chunkArray(
        Array.from(candidateIds),
        OVERSIGHT_ATTENTION_ID_CHUNK_SIZE,
      )) {
        let query = supabase.from("companies").select("id");
        query = applyOversightStructuralFilters(
          query,
          structuralFilters,
          officeUserIds,
        );
        const { data } = await query.in("id", chunk);
        matched.push(
          ...((data ?? []) as Array<{ id: string }>).map((row) => row.id),
        );
      }

      return matched;
    }
    case "no_contacts": {
      const contactCompanyIds = await fetchContactCompanyIdSet();
      const noContactIds: string[] = [];
      let offset = 0;

      while (true) {
        let query = supabase.from("companies").select("id");
        query = applyOversightStructuralFilters(
          query,
          structuralFilters,
          officeUserIds,
        );
        const { data, error } = await query
          .order("id", { ascending: true })
          .range(offset, offset + OVERSIGHT_FETCH_PAGE_SIZE - 1);

        if (error) {
          break;
        }

        const batch = data ?? [];
        for (const row of batch) {
          if (!contactCompanyIds.has(row.id)) {
            noContactIds.push(row.id);
          }
        }

        if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
          break;
        }

        offset += OVERSIGHT_FETCH_PAGE_SIZE;
      }

      return noContactIds;
    }
    default:
      return [];
  }
}

async function countCompaniesMatchingFilters(
  filters: AdminCompaniesOversightFilters,
  profiles: OversightProfileRow[],
  options?: {
    requireHighPriority?: boolean;
    companyIds?: string[];
    inactiveOnly?: boolean;
    noContactsOnly?: boolean;
    overdueOnly?: boolean;
  },
): Promise<number> {
  const officeUserIds = resolveOfficeUserIds(filters.officeId, profiles);
  if (filters.officeId !== "all" && officeUserIds?.length === 0) {
    return 0;
  }

  const effectiveFilters = {
    ...filters,
    attention: options?.overdueOnly ||
      options?.noContactsOnly ||
      options?.inactiveOnly
      ? ("all" as const)
      : filters.attention,
  };

  if (attentionFilterUsesCompanyIds(effectiveFilters.attention)) {
    const attentionIds =
      options?.companyIds ??
      (await resolveAttentionCompanyIds(effectiveFilters, profiles));
    if (attentionIds.length === 0) {
      return 0;
    }

    let total = 0;
    for (const chunk of chunkArray(
      attentionIds,
      OVERSIGHT_ATTENTION_ID_CHUNK_SIZE,
    )) {
      let query = supabase
        .from("companies")
        .select("id", { count: "exact", head: true });
      query = applyOversightStructuralFilters(
        query,
        { ...effectiveFilters, attention: "all" },
        officeUserIds,
      );
      if (options?.requireHighPriority) {
        query = query.in("priority", ["High", "Hot Lead"]);
      }
      if (options?.inactiveOnly) {
        const cutoff = getInactivityCutoff().toISOString();
        query = query.or(`last_contact_at.is.null,last_contact_at.lt.${cutoff}`);
      }
      const { count, error } = await query.in("id", chunk);
      if (error) {
        return 0;
      }
      total += count ?? 0;
    }

    return total;
  }

  let query = supabase
    .from("companies")
    .select("id", { count: "exact", head: true });
  query = applyOversightStructuralFilters(query, effectiveFilters, officeUserIds);
  query = applyDirectAttentionFilters(query, effectiveFilters.attention);

  if (options?.requireHighPriority) {
    query = query.in("priority", ["High", "Hot Lead"]);
  }
  if (options?.inactiveOnly) {
    const cutoff = getInactivityCutoff().toISOString();
    query = query.or(`last_contact_at.is.null,last_contact_at.lt.${cutoff}`);
  }
  if (options?.overdueOnly) {
    const overdueIds = await fetchOverdueAttentionCompanyIds(
      effectiveFilters,
      profiles,
    );
    if (overdueIds.length === 0) {
      return 0;
    }
    let total = 0;
    for (const chunk of chunkArray(
      overdueIds,
      OVERSIGHT_ATTENTION_ID_CHUNK_SIZE,
    )) {
      let overdueQuery = supabase
        .from("companies")
        .select("id", { count: "exact", head: true });
      overdueQuery = applyOversightStructuralFilters(
        overdueQuery,
        { ...effectiveFilters, attention: "all" },
        officeUserIds,
      );
      const { count, error } = await overdueQuery.in("id", chunk);
      if (error) {
        return 0;
      }
      total += count ?? 0;
    }
    return total;
  }
  if (options?.noContactsOnly) {
    const noContactIds = await resolveAttentionCompanyIds(
      { ...effectiveFilters, attention: "no_contacts" },
      profiles,
    );
    if (noContactIds.length === 0) {
      return 0;
    }
    let total = 0;
    for (const chunk of chunkArray(
      noContactIds,
      OVERSIGHT_ATTENTION_ID_CHUNK_SIZE,
    )) {
      let noContactQuery = supabase
        .from("companies")
        .select("id", { count: "exact", head: true });
      noContactQuery = applyOversightStructuralFilters(
        noContactQuery,
        { ...effectiveFilters, attention: "all" },
        officeUserIds,
      );
      const { count, error } = await noContactQuery.in("id", chunk);
      if (error) {
        return 0;
      }
      total += count ?? 0;
    }
    return total;
  }

  const { count, error } = await query;
  if (error) {
    return 0;
  }

  return count ?? 0;
}

async function fetchOverdueAttentionCompanyIds(
  filters: AdminCompaniesOversightFilters,
  profiles: OversightProfileRow[],
): Promise<string[]> {
  return resolveAttentionCompanyIds(
    { ...filters, attention: "overdue_follow_up" },
    profiles,
  );
}

export async function fetchFilteredOversightSummary(
  filters: AdminCompaniesOversightFilters,
  profiles: OversightProfileRow[],
): Promise<AdminCompaniesSummary> {
  const [
    totalCompanies,
    highPriorityCompanies,
    companiesWithOverdueFollowUps,
    companiesNoActivity30d,
    companiesWithNoContacts,
  ] = await Promise.all([
    countCompaniesMatchingFilters(filters, profiles),
    countCompaniesMatchingFilters(filters, profiles, {
      requireHighPriority: true,
    }),
    countCompaniesMatchingFilters(filters, profiles, { overdueOnly: true }),
    countCompaniesMatchingFilters(filters, profiles, { inactiveOnly: true }),
    countCompaniesMatchingFilters(filters, profiles, { noContactsOnly: true }),
  ]);

  return {
    totalCompanies,
    highPriorityCompanies,
    companiesWithOverdueFollowUps,
    companiesNoActivity30d,
    companiesWithNoContacts,
  };
}

async function fetchOwnerCompanyTotalCount(
  ownerUserId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerUserId)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

async function enrichOversightCompanies(
  companies: RawOversightCompany[],
  profiles: OversightProfileRow[],
  offices: Office[],
): Promise<AdminCompanyOversightRow[]> {
  if (companies.length === 0) {
    return [];
  }

  const companyIds = companies.map((company) => company.id);
  const officeNameById = new Map(offices.map((office) => [office.id, office.name]));
  const profileById = new Map(
    profiles.map((profile) => [
      profile.id,
      {
        id: profile.id,
        email: profile.email ?? "",
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active ?? true,
        is_blocked: profile.is_blocked ?? false,
        blocked_at: profile.blocked_at ?? null,
        blocked_reason: profile.blocked_reason ?? null,
        office_id: profile.office_id ?? null,
      },
    ]),
  );

  const [
    contactsResult,
    activitiesResult,
    followUpsResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase.from("contacts").select("id, company_id").in("company_id", companyIds),
    supabase
      .from("activities")
      .select("company_id, activity_at")
      .in("company_id", companyIds),
    supabase
      .from("follow_ups")
      .select("company_id, due_at, status")
      .in("company_id", companyIds),
    supabase
      .from("load_opportunities")
      .select(
        "company_id, status, estimated_revenue_usd, quoted_rate, target_rate",
      )
      .in("company_id", companyIds),
  ]);

  const contactCountByCompany = new Map<string, number>();
  for (const contact of contactsResult.data ?? []) {
    contactCountByCompany.set(
      contact.company_id,
      (contactCountByCompany.get(contact.company_id) ?? 0) + 1,
    );
  }

  const activityCountByCompany = new Map<string, number>();
  const lastActivityByCompany = new Map<string, string>();
  for (const activity of activitiesResult.data ?? []) {
    activityCountByCompany.set(
      activity.company_id,
      (activityCountByCompany.get(activity.company_id) ?? 0) + 1,
    );

    const existing = lastActivityByCompany.get(activity.company_id);
    if (
      !existing ||
      new Date(activity.activity_at) > new Date(existing)
    ) {
      lastActivityByCompany.set(activity.company_id, activity.activity_at);
    }
  }

  const pendingFollowUpsByCompany = new Map<
    string,
    Array<{ due_at: string; status: string }>
  >();
  for (const followUp of followUpsResult.data ?? []) {
    if (followUp.status !== "pending") continue;
    const list = pendingFollowUpsByCompany.get(followUp.company_id) ?? [];
    list.push({ due_at: followUp.due_at, status: followUp.status });
    pendingFollowUpsByCompany.set(followUp.company_id, list);
  }

  const openOpportunitiesByCompany = new Map<
    string,
    Array<{
      status: string;
      estimated_revenue_usd: number | null;
      quoted_rate: number | null;
      target_rate: number | null;
    }>
  >();
  for (const opportunity of opportunitiesResult.data ?? []) {
    if (!isOpenOpportunityStage(opportunity.status)) continue;
    const list = openOpportunitiesByCompany.get(opportunity.company_id) ?? [];
    list.push(opportunity);
    openOpportunitiesByCompany.set(opportunity.company_id, list);
  }

  return companies.map((company) => {
    const country = company.country?.trim() || null;
    const profile = profileById.get(company.user_id);
    const brokerName = profile
      ? getProfileDisplayName({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role as "admin" | "broker",
          is_active: profile.is_active,
          is_blocked: profile.is_blocked,
          blocked_at: profile.blocked_at,
          blocked_reason: profile.blocked_reason,
        })
      : "Unknown owner";
    const brokerEmail = profile?.email ?? "—";
    const brokerOfficeId = profile?.office_id ?? null;
    const brokerOfficeName = brokerOfficeId
      ? officeNameById.get(brokerOfficeId) ?? UNASSIGNED_OFFICE_LABEL
      : UNASSIGNED_OFFICE_LABEL;

    const pendingForCompany = pendingFollowUpsByCompany.get(company.id) ?? [];
    let overdueFollowUpCount = 0;
    let dueTodayFollowUpCount = 0;

    for (const followUp of pendingForCompany) {
      const bucket = getFollowUpBucket(followUp.due_at);
      if (bucket === "overdue") overdueFollowUpCount += 1;
      if (bucket === "today") dueTodayFollowUpCount += 1;
    }

    const openOpps = openOpportunitiesByCompany.get(company.id) ?? [];
    const openOpportunityValue = openOpps.reduce(
      (sum, opportunity) => sum + getOpportunityPipelineValue(opportunity),
      0,
    );

    const activityLast = lastActivityByCompany.get(company.id) ?? null;
    const lastContactAt =
      company.last_contact_at && activityLast
        ? new Date(company.last_contact_at) > new Date(activityLast)
          ? company.last_contact_at
          : activityLast
        : company.last_contact_at ?? activityLast;

    const pendingDates = pendingForCompany.map((followUp) => followUp.due_at);
    const earliestPending = pendingDates.sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    )[0];
    const nextFollowUpAt = earliestPending ?? company.next_follow_up_at ?? null;

    const baseRow = {
      companyId: company.id,
      companyName: company.name,
      country,
      priority: company.priority,
      brokerUserId: company.user_id,
      brokerName,
      brokerEmail,
      brokerOfficeId,
      brokerOfficeName,
      createdAt: company.created_at,
      lastContactAt,
      nextFollowUpAt,
      contactCount: contactCountByCompany.get(company.id) ?? 0,
      activityCount: activityCountByCompany.get(company.id) ?? 0,
      openFollowUpCount: pendingForCompany.length,
      overdueFollowUpCount,
      dueTodayFollowUpCount,
      openOpportunityCount: openOpps.length,
      openOpportunityValue,
    };

    return {
      ...baseRow,
      attentionBadges: buildCompanyAttentionBadges(baseRow),
      isArchived: Boolean(company.deleted_at),
      deletedAt: company.deleted_at ?? null,
      deleteReason: company.delete_reason ?? null,
      accountStatus: normalizeAccountStatus(company.account_status),
      accountDisposition: company.account_disposition ?? null,
    };
  });
}

export async function fetchAdminCompaniesOversightMeta(): Promise<{
  data: AdminCompaniesOversightMeta | null;
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: null,
      error: { message: "Admin access required." },
    };
  }

  const [profilesResult, officesResult, countriesResult] = await Promise.all([
    fetchOversightProfiles(),
    fetchOversightOffices(),
    fetchOversightCountries(),
  ]);

  const firstError =
    profilesResult.error ??
    officesResult.error ??
    countriesResult.error;

  if (firstError) {
    return { data: null, error: firstError };
  }

  const profiles = profilesResult.data;
  const unfilteredSummary = await fetchFilteredOversightSummary(
    {
      search: "",
      brokerUserId: "all",
      officeId: "all",
      priority: "all",
      country: "all",
      attention: "all",
      lifecycle: "active",
      accountStatus: "all",
      sort: "name_asc",
    },
    profiles,
  );

  const brokers = buildOversightOwnerOptions({
    profiles,
    companyOwnerIds: [],
  });

  return {
    data: {
      unfilteredSummary,
      brokers,
      countries: countriesResult.data,
      offices: officesResult.data,
    },
    error: null,
  };
}

export async function fetchAdminCompaniesOversightPage(input: {
  filters: AdminCompaniesOversightFilters;
  page: number;
  pageSize: number;
}): Promise<{
  data: AdminCompaniesOversightPageData | null;
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: null,
      error: { message: "Admin access required." },
    };
  }

  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const [profilesResult, officesResult] = await Promise.all([
    fetchOversightProfiles(),
    fetchOversightOffices(),
  ]);

  const firstError = profilesResult.error ?? officesResult.error;
  if (firstError) {
    return { data: null, error: firstError };
  }

  const profiles = profilesResult.data;
  const offices = officesResult.data;
  const officeUserIds = resolveOfficeUserIds(input.filters.officeId, profiles);

  if (input.filters.officeId !== "all" && officeUserIds?.length === 0) {
    return {
      data: {
        companies: [],
        totalCount: 0,
        page,
        pageSize,
        summary: EMPTY_SUMMARY,
        ownerTotalCount:
          input.filters.brokerUserId !== "all"
            ? await fetchOwnerCompanyTotalCount(input.filters.brokerUserId)
            : null,
      },
      error: null,
    };
  }

  let companies: RawOversightCompany[] = [];
  let totalCount = 0;

  if (attentionFilterUsesCompanyIds(input.filters.attention)) {
    const attentionIds = await resolveAttentionCompanyIds(
      input.filters,
      profiles,
    );
    totalCount = await countCompaniesMatchingFilters(input.filters, profiles);

    if (totalCount > 0 && attentionIds.length > 0) {
      const refs: Array<{ id: string; name: string; created_at: string }> = [];
      for (const chunk of chunkArray(
        attentionIds,
        OVERSIGHT_ATTENTION_ID_CHUNK_SIZE,
      )) {
        const { data } = await supabase
          .from("companies")
          .select("id, name, created_at")
          .in("id", chunk);
        refs.push(
          ...((data ?? []) as Array<{
            id: string;
            name: string;
            created_at: string;
          }>),
        );
      }

      const sortedRefs = sortOversightCompanyRefs(refs, input.filters.sort);
      const pageIds = sortedRefs.slice(from, from + pageSize).map((row) => row.id);
      companies = await fetchCompaniesByIds(pageIds);
    }
  } else {
    let query = supabase
      .from("companies")
      .select(COMPANY_OVERSIGHT_SELECT, { count: "exact" });
    query = applyOversightStructuralFilters(
      query,
      input.filters,
      officeUserIds,
    );
    query = applyDirectAttentionFilters(query, input.filters.attention);
    query = applyOversightSort(query, input.filters.sort);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      return { data: null, error };
    }

    companies = (data ?? []) as RawOversightCompany[];
    totalCount = count ?? 0;
  }

  const [enrichedCompanies, summary, ownerTotalCount] = await Promise.all([
    enrichOversightCompanies(companies, profiles, offices),
    fetchFilteredOversightSummary(input.filters, profiles),
    input.filters.brokerUserId !== "all"
      ? fetchOwnerCompanyTotalCount(input.filters.brokerUserId)
      : Promise.resolve(null),
  ]);

  return {
    data: {
      companies: enrichedCompanies,
      totalCount,
      page,
      pageSize,
      summary,
      ownerTotalCount,
    },
    error: null,
  };
}

export async function fetchOversightCompanyIdsForFilters(
  filters: AdminCompaniesOversightFilters,
): Promise<{
  data: string[];
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: [],
      error: { message: "Admin access required." },
    };
  }

  const profilesResult = await fetchOversightProfiles();
  if (profilesResult.error) {
    return { data: [], error: profilesResult.error };
  }

  const profiles = profilesResult.data;
  const officeUserIds = resolveOfficeUserIds(filters.officeId, profiles);

  if (filters.officeId !== "all" && officeUserIds?.length === 0) {
    return { data: [], error: null };
  }

  if (attentionFilterUsesCompanyIds(filters.attention)) {
    const ids = await resolveAttentionCompanyIds(filters, profiles);
    return { data: ids, error: null };
  }

  const ids: string[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from("companies").select("id");
    query = applyOversightStructuralFilters(query, filters, officeUserIds);
    query = applyDirectAttentionFilters(query, filters.attention);
    query = applyOversightSort(query, filters.sort);

    const { data, error } = await query.range(
      offset,
      offset + OVERSIGHT_FETCH_PAGE_SIZE - 1,
    );

    if (error) {
      return { data: [], error };
    }

    const batch = (data ?? []) as Array<{ id: string }>;
    ids.push(...batch.map((row) => row.id));

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return { data: ids, error: null };
}

function getInactivityCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function isHighPriority(priority: string): boolean {
  return priority === "High" || priority === "Hot Lead";
}

function isInactive30Days(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  return new Date(lastActivityAt) < getInactivityCutoff();
}

function hasOverdueFollowUp(input: {
  overdueFollowUpCount: number;
  nextFollowUpAt: string | null;
}): boolean {
  if (input.overdueFollowUpCount > 0) return true;
  if (!input.nextFollowUpAt) return false;
  return getFollowUpBucket(input.nextFollowUpAt) === "overdue";
}

function hasDueTodayFollowUp(input: {
  dueTodayFollowUpCount: number;
  nextFollowUpAt: string | null;
}): boolean {
  if (input.dueTodayFollowUpCount > 0) return true;
  if (!input.nextFollowUpAt) return false;
  return getFollowUpBucket(input.nextFollowUpAt) === "today";
}

export function buildCompanyAttentionBadges(row: {
  priority: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  contactCount: number;
  overdueFollowUpCount: number;
  dueTodayFollowUpCount: number;
  openOpportunityCount: number;
}): AdminCompanyAttentionBadge[] {
  const badges: AdminCompanyAttentionBadge[] = [];

  if (
    hasOverdueFollowUp({
      overdueFollowUpCount: row.overdueFollowUpCount,
      nextFollowUpAt: row.nextFollowUpAt,
    })
  ) {
    badges.push("overdue_follow_up");
  }

  if (
    hasDueTodayFollowUp({
      dueTodayFollowUpCount: row.dueTodayFollowUpCount,
      nextFollowUpAt: row.nextFollowUpAt,
    })
  ) {
    badges.push("due_today");
  }

  if (isInactive30Days(row.lastContactAt)) {
    badges.push("no_activity_30d");
  }

  if (row.contactCount === 0) {
    badges.push("no_contacts");
  }

  if (isHighPriority(row.priority)) {
    badges.push("high_priority");
  }

  if (row.openOpportunityCount > 0) {
    badges.push("open_opportunity");
  }

  return badges;
}

export function computeAdminCompaniesSummary(
  companies: AdminCompanyOversightRow[],
): AdminCompaniesSummary {
  return {
    totalCompanies: companies.length,
    highPriorityCompanies: companies.filter((company) =>
      isHighPriority(company.priority),
    ).length,
    companiesWithOverdueFollowUps: companies.filter((company) =>
      company.attentionBadges.includes("overdue_follow_up"),
    ).length,
    companiesNoActivity30d: companies.filter((company) =>
      company.attentionBadges.includes("no_activity_30d"),
    ).length,
    companiesWithNoContacts: companies.filter((company) =>
      company.attentionBadges.includes("no_contacts"),
    ).length,
  };
}

export function filterAdminCompanies(
  companies: AdminCompanyOversightRow[],
  filters: {
    search: string;
    brokerUserId: string;
    officeId: string;
    priority: string;
    country: string;
    attention: AdminCompanyAttentionStatus;
    lifecycle: AdminCompanyLifecycleStatus;
    accountStatus: AccountStatusFilter;
    sort: AdminCompanySortOption;
  },
): AdminCompanyOversightRow[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  let rows = companies.filter((company) => {
    if (filters.lifecycle === "active" && company.isArchived) return false;
    if (filters.lifecycle === "archived" && !company.isArchived) return false;

    if (
      filters.accountStatus !== "all" &&
      !matchesAdminAccountStatusFilter(company.accountStatus, filters.accountStatus)
    ) {
      return false;
    }

    if (normalizedSearch) {
      if (!company.companyName.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
    }

    if (filters.brokerUserId !== "all" && company.brokerUserId !== filters.brokerUserId) {
      return false;
    }

    if (filters.officeId !== "all") {
      if (filters.officeId === "unassigned") {
        if (company.brokerOfficeId !== null) return false;
      } else if (company.brokerOfficeId !== filters.officeId) {
        return false;
      }
    }

    if (filters.priority !== "all" && company.priority !== filters.priority) {
      return false;
    }

    if (filters.country !== "all") {
      const companyCountry = company.country?.trim() || "—";
      if (companyCountry !== filters.country) return false;
    }

    switch (filters.attention) {
      case "all":
        return true;
      case "overdue_follow_up":
        return company.attentionBadges.includes("overdue_follow_up");
      case "no_activity_30d":
        return company.attentionBadges.includes("no_activity_30d");
      case "no_contacts":
        return company.attentionBadges.includes("no_contacts");
      case "high_priority":
        return company.attentionBadges.includes("high_priority");
      case "has_open_opportunity":
        return company.attentionBadges.includes("open_opportunity");
    }
  });

  rows = [...rows].sort((a, b) => {
    switch (filters.sort) {
      case "name_asc":
        return a.companyName.localeCompare(b.companyName);
      case "name_desc":
        return b.companyName.localeCompare(a.companyName);
      case "created_newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "created_oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
  });

  return rows;
}

function matchesAdminAccountStatusFilter(
  status: AccountStatus,
  filter: AccountStatusFilter,
): boolean {
  if (filter === "working") {
    return status === "active" || status === "paused";
  }
  if (filter === "all") return true;
  return status === filter;
}

async function fetchAllPaginatedRows<T>(input: {
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{
    data: T[] | null;
    error: { message?: string } | null;
  }>;
}): Promise<{ data: T[]; error: { message?: string } | null }> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await input.fetchPage(
      offset,
      offset + OVERSIGHT_FETCH_PAGE_SIZE - 1,
    );

    if (error) {
      return { data: [], error };
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < OVERSIGHT_FETCH_PAGE_SIZE) {
      break;
    }

    offset += OVERSIGHT_FETCH_PAGE_SIZE;
  }

  return { data: rows, error: null };
}

export async function fetchAllCompaniesForOversight(): Promise<{
  data: Array<{
    id: string;
    user_id: string;
    name: string;
    country: string | null;
    priority: string;
    last_contact_at: string | null;
    next_follow_up_at: string | null;
    created_at: string;
    deleted_at: string | null;
    delete_reason: string | null;
    account_status: string | null;
    account_disposition: string | null;
  }>;
  error: { message?: string } | null;
}> {
  return fetchAllPaginatedRows({
    fetchPage: async (from, to) => {
      const { data, error } = await supabase
        .from("companies")
        .select(COMPANY_OVERSIGHT_SELECT)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: data as Array<{
          id: string;
          user_id: string;
          name: string;
          country: string | null;
          priority: string;
          last_contact_at: string | null;
          next_follow_up_at: string | null;
          created_at: string;
          deleted_at: string | null;
          delete_reason: string | null;
          account_status: string | null;
          account_disposition: string | null;
        }> | null,
        error,
      };
    },
  });
}

function profileToUserProfile(profile: {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean | null;
  is_blocked: boolean | null;
  blocked_at: string | null;
  blocked_reason: string | null;
}): UserProfile {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: normalizeUserRole(profile.role),
    is_active: profile.is_active ?? true,
    is_blocked: profile.is_blocked ?? false,
    blocked_at: profile.blocked_at ?? null,
    blocked_reason: profile.blocked_reason ?? null,
  };
}

function buildOversightOwnerOptions(input: {
  profiles: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    is_active: boolean | null;
    is_blocked: boolean | null;
    blocked_at: string | null;
    blocked_reason: string | null;
  }>;
  companyOwnerIds: Iterable<string>;
}): AdminCompaniesBrokerOption[] {
  const userProfiles = input.profiles.map((profile) =>
    profileToUserProfile(profile),
  );
  const ownersById = new Map(
    getAssignableCompanyOwners(userProfiles).map((owner) => [
      owner.userId,
      owner,
    ]),
  );

  for (const userId of input.companyOwnerIds) {
    if (ownersById.has(userId)) {
      continue;
    }

    const profile = input.profiles.find((item) => item.id === userId);
    if (!profile || !isBrokerProductivityEligibleRole(profile.role)) {
      continue;
    }

    ownersById.set(userId, {
      userId: profile.id,
      name: getProfileDisplayName(profileToUserProfile(profile)),
      email: profile.email ?? "—",
      role: normalizeUserRole(profile.role),
    });
  }

  return Array.from(ownersById.values()).sort((a, b) => {
    const roleOrder = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
    if (roleOrder !== 0) {
      return roleOrder;
    }

    return a.name.localeCompare(b.name);
  });
}

export const ADMIN_COMPANY_PRIORITIES = COMPANY_PRIORITIES;

export function getAssignableCompanyOwners(
  profiles: UserProfile[],
): AdminCompaniesBrokerOption[] {
  return profiles
    .filter(
      (profile) =>
        profile.is_active !== false &&
        !profile.is_blocked &&
        (profile.role === "broker" ||
          profile.role === "admin" ||
          profile.role === "super_admin"),
    )
    .map((profile) => ({
      userId: profile.id,
      name: getProfileDisplayName(profile),
      email: profile.email ?? "—",
      role: profile.role,
    }))
    .sort((a, b) => {
      const roleOrder = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
      if (roleOrder !== 0) return roleOrder;
      return a.name.localeCompare(b.name);
    });
}

export function attentionBadgeLabel(badge: AdminCompanyAttentionBadge): string {
  switch (badge) {
    case "overdue_follow_up":
      return "Overdue follow-up";
    case "due_today":
      return "Due today";
    case "no_activity_30d":
      return "No activity 30+ days";
    case "no_contacts":
      return "No contacts";
    case "high_priority":
      return "High priority";
    case "open_opportunity":
      return "Open opportunity";
  }
}

export function attentionBadgeClass(badge: AdminCompanyAttentionBadge): string {
  switch (badge) {
    case "overdue_follow_up":
      return "bg-red-100 text-red-800";
    case "due_today":
      return "bg-amber-100 text-amber-800";
    case "no_activity_30d":
      return "bg-stone-100 text-stone-700";
    case "no_contacts":
      return "bg-orange-100 text-orange-800";
    case "high_priority":
      return "bg-rose-100 text-rose-800";
    case "open_opportunity":
      return "bg-sky-100 text-sky-800";
  }
}

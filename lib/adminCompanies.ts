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
  const roleLabel = owner.role === "admin" ? "Admin" : "Broker";
  return `${owner.name} (${owner.email}) · ${roleLabel}`;
}

export interface AdminCompaniesOversightData {
  summary: AdminCompaniesSummary;
  companies: AdminCompanyOversightRow[];
  brokers: AdminCompaniesBrokerOption[];
  countries: string[];
  offices: Office[];
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

const COMPANY_OVERSIGHT_SELECT =
  "id, user_id, name, country, priority, last_contact_at, next_follow_up_at, created_at, deleted_at, delete_reason, account_status, account_disposition";

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

export async function fetchAdminCompaniesOversight(): Promise<{
  data: AdminCompaniesOversightData | null;
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: null,
      error: { message: "Admin access required." },
    };
  }

  const [
    profilesResult,
    officesResult,
    companiesResult,
    contactsResult,
    activitiesResult,
    followUpsResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason, office_id"),
    supabase
      .from("offices")
      .select("id, name, city, is_active")
      .eq("is_active", true)
      .order("name"),
    fetchAllCompaniesForOversight(),
    fetchAllPaginatedRows<{ id: string; company_id: string }>({
      fetchPage: async (from, to) => {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, company_id")
          .order("id", { ascending: true })
          .range(from, to);

        return { data, error };
      },
    }),
    fetchAllPaginatedRows<{ company_id: string; activity_at: string }>({
      fetchPage: async (from, to) => {
        const { data, error } = await supabase
          .from("activities")
          .select("company_id, activity_at")
          .order("id", { ascending: true })
          .range(from, to);

        return { data, error };
      },
    }),
    fetchAllPaginatedRows<{ company_id: string; due_at: string; status: string }>({
      fetchPage: async (from, to) => {
        const { data, error } = await supabase
          .from("follow_ups")
          .select("company_id, due_at, status")
          .order("id", { ascending: true })
          .range(from, to);

        return { data, error };
      },
    }),
    fetchAllPaginatedRows<{
      company_id: string;
      status: string;
      estimated_revenue_usd: number | null;
      quoted_rate: number | null;
      target_rate: number | null;
    }>({
      fetchPage: async (from, to) => {
        const { data, error } = await supabase
          .from("load_opportunities")
          .select(
            "company_id, status, estimated_revenue_usd, quoted_rate, target_rate",
          )
          .order("id", { ascending: true })
          .range(from, to);

        return { data, error };
      },
    }),
  ]);

  const firstError =
    profilesResult.error ??
    officesResult.error ??
    companiesResult.error ??
    contactsResult.error ??
    activitiesResult.error ??
    followUpsResult.error ??
    opportunitiesResult.error;

  if (firstError) {
    return { data: null, error: firstError };
  }

  const profiles = profilesResult.data ?? [];
  const offices = (officesResult.data ?? []).map((office) => ({
    id: office.id,
    name: office.name,
    city: office.city,
    isActive: office.is_active ?? true,
  }));
  const officeNameById = new Map(offices.map((office) => [office.id, office.name]));
  const companies = companiesResult.data;
  const contacts = contactsResult.data;
  const activities = activitiesResult.data;
  const followUps = followUpsResult.data;
  const opportunities = opportunitiesResult.data;

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

  const contactCountByCompany = new Map<string, number>();
  for (const contact of contacts) {
    contactCountByCompany.set(
      contact.company_id,
      (contactCountByCompany.get(contact.company_id) ?? 0) + 1,
    );
  }

  const activityCountByCompany = new Map<string, number>();
  const lastActivityByCompany = new Map<string, string>();
  for (const activity of activities) {
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
  for (const followUp of followUps) {
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
  for (const opportunity of opportunities) {
    if (!isOpenOpportunityStage(opportunity.status)) continue;
    const list = openOpportunitiesByCompany.get(opportunity.company_id) ?? [];
    list.push(opportunity);
    openOpportunitiesByCompany.set(opportunity.company_id, list);
  }

  const brokerIds = new Set<string>();
  const countrySet = new Set<string>();

  const companyRows: AdminCompanyOversightRow[] = companies.map((company) => {
    brokerIds.add(company.user_id);

    const country = company.country?.trim() || null;
    if (country) {
      countrySet.add(country);
    }

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

  const brokers = buildOversightOwnerOptions({
    profiles,
    companyOwnerIds: brokerIds,
  });

  const countries = Array.from(countrySet).sort((a, b) => a.localeCompare(b));

  return {
    data: {
      summary: computeAdminCompaniesSummary(companyRows),
      companies: companyRows,
      brokers,
      countries,
      offices,
    },
    error: null,
  };
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
        (profile.role === "broker" || profile.role === "admin"),
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

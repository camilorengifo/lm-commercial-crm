import { isOpenOpportunityStage } from "@/lib/crmConstants";
import {
  classifyBrokerActivityLevel,
  computeProductivityScore,
  getOpportunityPipelineValue,
  isBrokerProductivityEligibleRole,
  type BrokerActivityLevel,
} from "@/lib/brokerProductivity";
import { getFollowUpBucket, getWeekBounds } from "@/lib/followUps";
import {
  getProfileDisplayName,
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/userProfile";
import {
  buildOwnedCompanyCountByUserId,
  fetchAllCompaniesForProductivityMetrics,
  getOwnedCompanyCount,
  type ProductivityCompanyRow,
} from "@/lib/brokerDataAccess";
import { supabase } from "@/lib/supabaseClient";
import { verifyAdminAccess } from "@/lib/admin";
import {
  UNASSIGNED_OFFICE_LABEL,
  ALL_OFFICES_LABEL,
  type Office,
} from "@/lib/offices";

export interface BrokerProductivityRow {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  officeId: string | null;
  officeName: string;
  companies: number;
  contacts: number;
  activities7d: number;
  followUpsCompleted7d: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  opportunitiesCreated30d: number;
  opportunitiesWon30d: number;
  openOpportunities: number;
  wonOpportunities: number;
  lostOpportunities: number;
  openPipelineValue: number;
  companiesCreated30d: number;
  contactsCreated30d: number;
  lastActivityAt: string | null;
  productivityScore: number;
  activityLevel: Exclude<BrokerActivityLevel, "all">;
}

export interface OfficeProductivitySummary {
  officeId: string | null;
  officeName: string;
  totalBrokers: number;
  totalCompanies: number;
  totalActivities: number;
  totalFollowUps: number;
  overdueFollowUps: number;
  openOpportunities: number;
  quotedOpportunities: number;
  wonOpportunities: number;
}

export interface AdminOverviewKpis {
  totalBrokers: number;
  activeBrokers: number;
  totalCompanies: number;
  totalContacts: number;
  totalOpenFollowUps: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  followUpsCompletedThisWeek: number;
  totalOpportunities: number;
  openOpportunities: number;
  wonOpportunities: number;
  lostOpportunities: number;
  estimatedOpenPipelineValue: number;
  highPriorityCompanies: number;
}

export interface NeedsAttentionBroker {
  userId: string;
  name: string;
  email: string;
  reason: string;
  overdueFollowUps: number;
}

export interface NeedsAttentionCompany {
  companyId: string;
  companyName: string;
  brokerName: string;
  overdueFollowUpCount: number;
}

export interface NeedsAttentionOpportunity {
  opportunityId: string;
  opportunityName: string;
  companyId: string;
  companyName: string;
  brokerName: string;
  status: string;
  daysSinceActivity: number | null;
}

export interface CommercialPulseActivity {
  id: string;
  companyId: string;
  companyName: string;
  brokerName: string;
  activityType: string;
  activityAt: string;
  preview: string;
}

export interface CommercialPulseOpportunity {
  id: string;
  companyId: string;
  companyName: string;
  brokerName: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface CommercialPulseFollowUp {
  id: string;
  companyId: string;
  companyName: string;
  brokerName: string;
  title: string;
  completedAt: string;
}

export interface AdminOverviewData {
  kpis: AdminOverviewKpis;
  brokerProductivity: BrokerProductivityRow[];
  officeSummaries: OfficeProductivitySummary[];
  offices: Office[];
  needsAttention: {
    brokers: NeedsAttentionBroker[];
    inactiveBrokers: NeedsAttentionBroker[];
    companies: NeedsAttentionCompany[];
    opportunities: NeedsAttentionOpportunity[];
  };
  commercialPulse: {
    recentActivities: CommercialPulseActivity[];
    recentOpportunities: CommercialPulseOpportunity[];
    completedFollowUps: CommercialPulseFollowUp[];
  };
}

export type AdminOfficeFilter = "all" | "unassigned" | string;

export interface AdminBrokerDetailData {
  profile: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
  metrics: BrokerProductivityRow;
  companies: Array<{
    id: string;
    name: string;
    salesStage: string;
    priority: string;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
  }>;
  followUps: {
    dueToday: number;
    overdue: number;
    completedThisWeek: number;
    pending: Array<{
      id: string;
      title: string;
      dueAt: string;
      status: string;
      companyId: string;
      companyName: string;
    }>;
  };
  opportunities: {
    open: number;
    won: number;
    lost: number;
    byStatus: Array<{ status: string; count: number }>;
    recent: Array<{
      id: string;
      name: string;
      status: string;
      companyId: string;
      companyName: string;
      pipelineValue: number;
    }>;
  };
  recentActivities: CommercialPulseActivity[];
  needsAttention: Array<{
    kind: "overdue_follow_up" | "inactive_company" | "stuck_opportunity";
    title: string;
    detail: string;
    href: string;
  }>;
}

function getCutoffDays(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function isHighPriority(priority: string): boolean {
  return priority === "High" || priority === "Hot Lead";
}

function buildActivityPreview(
  subject: string | null,
  notes: string | null,
): string {
  const trimmedSubject = subject?.trim();
  const trimmedNotes = notes?.trim();

  if (trimmedSubject && trimmedNotes) {
    return `${trimmedSubject} — ${trimmedNotes}`;
  }

  return trimmedSubject || trimmedNotes || "No details recorded";
}

export interface RawCrmData {
  profiles: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    is_active: boolean | null;
    is_blocked: boolean | null;
    blocked_at: string | null;
    blocked_reason: string | null;
    office_id: string | null;
  }>;
  offices: Array<{
    id: string;
    name: string;
    city: string | null;
    is_active: boolean | null;
  }>;
  companies: ProductivityCompanyRow[];
  contacts: Array<{ id: string; user_id: string; created_at: string }>;
  activities: Array<{
    id: string;
    user_id: string;
    company_id: string;
    activity_type: string;
    subject: string | null;
    notes: string | null;
    activity_at: string;
  }>;
  followUps: Array<{
    id: string;
    user_id: string;
    company_id: string;
    title: string;
    due_at: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>;
  opportunities: Array<{
    id: string;
    user_id: string;
    company_id: string;
    name: string;
    status: string;
    estimated_revenue_usd: number | null;
    quoted_rate: number | null;
    target_rate: number | null;
    created_at: string;
  }>;
}

async function fetchRawCrmData(): Promise<{
  data: RawCrmData | null;
  error: { message?: string } | null;
}> {
  const [
    profilesResult,
    officesResult,
    companiesResult,
    contactsResult,
    followUpsResult,
    opportunitiesResult,
    activitiesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason, office_id",
      ),
    supabase
      .from("offices")
      .select("id, name, city, is_active")
      .eq("is_active", true)
      .order("name"),
    fetchAllCompaniesForProductivityMetrics(),
    supabase.from("contacts").select("id, user_id, created_at"),
    supabase
      .from("follow_ups")
      .select(
        "id, user_id, company_id, title, due_at, status, completed_at, created_at",
      ),
    supabase
      .from("load_opportunities")
      .select(
        "id, user_id, company_id, name, status, estimated_revenue_usd, quoted_rate, target_rate, created_at",
      ),
    supabase
      .from("activities")
      .select(
        "id, user_id, company_id, activity_type, subject, notes, activity_at",
      )
      .order("activity_at", { ascending: false })
      .limit(500),
  ]);

  const firstError =
    profilesResult.error ??
    officesResult.error ??
    companiesResult.error ??
    contactsResult.error ??
    followUpsResult.error ??
    opportunitiesResult.error ??
    activitiesResult.error;

  if (firstError) {
    return { data: null, error: firstError };
  }

  return {
    data: {
      profiles: profilesResult.data ?? [],
      offices: officesResult.data ?? [],
      companies: companiesResult.data ?? [],
      contacts: contactsResult.data ?? [],
      followUps: followUpsResult.data ?? [],
      opportunities: opportunitiesResult.data ?? [],
      activities: activitiesResult.data ?? [],
    },
    error: null,
  };
}

function brokerMatchesOfficeFilter(
  officeId: string | null | undefined,
  officeFilter: AdminOfficeFilter,
): boolean {
  if (officeFilter === "all") {
    return true;
  }

  if (officeFilter === "unassigned") {
    return !officeId;
  }

  return officeId === officeFilter;
}

function getBrokerUserIdsForOfficeFilter(
  raw: RawCrmData,
  officeFilter: AdminOfficeFilter,
): Set<string> {
  return new Set(
    raw.profiles
      .filter((profile) => isBrokerProductivityEligibleRole(profile.role))
      .filter((profile) =>
        brokerMatchesOfficeFilter(profile.office_id, officeFilter),
      )
      .map((profile) => profile.id),
  );
}

export function filterRawCrmDataByOffice(
  raw: RawCrmData,
  officeFilter: AdminOfficeFilter,
): RawCrmData {
  if (officeFilter === "all") {
    return raw;
  }

  const brokerUserIds = getBrokerUserIdsForOfficeFilter(raw, officeFilter);
  const companyIds = new Set(
    raw.companies
      .filter((company) => brokerUserIds.has(company.user_id))
      .map((company) => company.id),
  );

  return {
    ...raw,
    companies: raw.companies.filter((company) => brokerUserIds.has(company.user_id)),
    contacts: raw.contacts.filter((contact) => brokerUserIds.has(contact.user_id)),
    followUps: raw.followUps.filter((followUp) =>
      companyIds.has(followUp.company_id),
    ),
    opportunities: raw.opportunities.filter((opportunity) =>
      companyIds.has(opportunity.company_id),
    ),
    activities: raw.activities.filter((activity) =>
      companyIds.has(activity.company_id),
    ),
  };
}

function buildBrokerProductivityRows(
  raw: RawCrmData,
  officeFilter: AdminOfficeFilter = "all",
): BrokerProductivityRow[] {
  const cutoff7d = getCutoffDays(7);
  const cutoff30d = getCutoffDays(30);

  const officeNameById = new Map(
    raw.offices.map((office) => [office.id, office.name]),
  );

  const brokerProfiles = raw.profiles
    .filter((profile) => isBrokerProductivityEligibleRole(profile.role))
    .filter((profile) =>
      brokerMatchesOfficeFilter(profile.office_id, officeFilter),
    )
    .map((profile) => ({
      id: profile.id,
      email: profile.email ?? "",
      full_name: profile.full_name,
      role: normalizeUserRole(profile.role),
      is_active: profile.is_active ?? true,
      is_blocked: profile.is_blocked ?? false,
      blocked_at: profile.blocked_at ?? null,
      blocked_reason: profile.blocked_reason ?? null,
      office_id: profile.office_id ?? null,
    }));

  const lastActivityByUser = new Map<string, string>();
  const activities7dByUser = new Map<string, number>();

  for (const activity of raw.activities) {
    if (!lastActivityByUser.has(activity.user_id)) {
      lastActivityByUser.set(activity.user_id, activity.activity_at);
    }

    if (new Date(activity.activity_at) >= cutoff7d) {
      activities7dByUser.set(
        activity.user_id,
        (activities7dByUser.get(activity.user_id) ?? 0) + 1,
      );
    }
  }

  for (const company of raw.companies) {
    const existing = lastActivityByUser.get(company.user_id);
    const companyLast = company.last_contact_at;
    if (
      companyLast &&
      (!existing || new Date(companyLast) > new Date(existing))
    ) {
      lastActivityByUser.set(company.user_id, companyLast);
    }
  }

  const companyCountByUserId = buildOwnedCompanyCountByUserId(raw.companies);

  return brokerProfiles.map((profile) => {
    const userId = profile.id;
    const pendingFollowUps = raw.followUps.filter(
      (followUp) => followUp.user_id === userId && followUp.status === "pending",
    );

    let followUpsDueToday = 0;
    let overdueFollowUps = 0;

    for (const followUp of pendingFollowUps) {
      const bucket = getFollowUpBucket(followUp.due_at);
      if (bucket === "today") followUpsDueToday += 1;
      if (bucket === "overdue") overdueFollowUps += 1;
    }

    const followUpsCompleted7d = raw.followUps.filter((followUp) => {
      if (followUp.user_id !== userId || followUp.status !== "completed") {
        return false;
      }
      if (!followUp.completed_at) return false;
      return new Date(followUp.completed_at) >= cutoff7d;
    }).length;

    const companiesCreated30d = raw.companies.filter(
      (company) =>
        company.user_id === userId &&
        new Date(company.created_at) >= cutoff30d,
    ).length;

    const contactsCreated30d = raw.contacts.filter(
      (contact) =>
        contact.user_id === userId &&
        new Date(contact.created_at) >= cutoff30d,
    ).length;

    const userOpportunities = raw.opportunities.filter(
      (opportunity) => opportunity.user_id === userId,
    );

    const opportunitiesCreated30d = userOpportunities.filter(
      (opportunity) => new Date(opportunity.created_at) >= cutoff30d,
    ).length;

    const opportunitiesWon30d = userOpportunities.filter(
      (opportunity) =>
        opportunity.status === "won" &&
        new Date(opportunity.created_at) >= cutoff30d,
    ).length;

    const openOpps = userOpportunities.filter((opportunity) =>
      isOpenOpportunityStage(opportunity.status),
    );

    const activities7d = activities7dByUser.get(userId) ?? 0;

    const productivityScore = computeProductivityScore({
      followUpsCompleted7d,
      activities7d,
      companiesCreated30d,
      contactsCreated30d,
      opportunitiesCreated30d,
      opportunitiesWon30d,
      overdueFollowUps,
    });

    return {
      userId,
      name: getProfileDisplayName(profile),
      email: profile.email ?? "—",
      role: profile.role,
      isActive: profile.is_active,
      officeId: profile.office_id,
      officeName: profile.office_id
        ? officeNameById.get(profile.office_id) ?? UNASSIGNED_OFFICE_LABEL
        : UNASSIGNED_OFFICE_LABEL,
      companies: getOwnedCompanyCount(companyCountByUserId, userId),
      contacts: raw.contacts.filter((contact) => contact.user_id === userId)
        .length,
      activities7d,
      followUpsCompleted7d,
      followUpsDueToday,
      overdueFollowUps,
      opportunitiesCreated30d,
      opportunitiesWon30d,
      openOpportunities: openOpps.length,
      wonOpportunities: userOpportunities.filter(
        (opportunity) => opportunity.status === "won",
      ).length,
      lostOpportunities: userOpportunities.filter(
        (opportunity) => opportunity.status === "lost",
      ).length,
      openPipelineValue: openOpps.reduce(
        (sum, opportunity) => sum + getOpportunityPipelineValue(opportunity),
        0,
      ),
      companiesCreated30d,
      contactsCreated30d,
      lastActivityAt: lastActivityByUser.get(userId) ?? null,
      productivityScore,
      activityLevel: classifyBrokerActivityLevel({
        productivityScore,
        activities7d,
        overdueFollowUps,
      }),
    };
  });
}

function buildOfficeProductivitySummaries(
  raw: RawCrmData,
  brokerRows: BrokerProductivityRow[],
  officeFilter: AdminOfficeFilter = "all",
): OfficeProductivitySummary[] {
  const officeNameById = new Map(
    raw.offices.map((office) => [office.id, office.name]),
  );

  const userOfficeByUserId = new Map(
    raw.profiles
      .filter((profile) => isBrokerProductivityEligibleRole(profile.role))
      .map((profile) => [profile.id, profile.office_id ?? null]),
  );

  const officeIds = [
    ...raw.offices.map((office) => office.id),
    null as string | null,
  ];

  const summaries = officeIds.map((officeId) => {
    const brokerUserIds = new Set(
      brokerRows
        .filter((broker) => broker.officeId === officeId)
        .map((broker) => broker.userId),
    );

    const companies = raw.companies.filter((company) => {
      const userOfficeId = userOfficeByUserId.get(company.user_id);
      return userOfficeId === officeId;
    });

    const companyIds = new Set(companies.map((company) => company.id));

    const activities = raw.activities.filter((activity) =>
      companyIds.has(activity.company_id),
    );

    const followUps = raw.followUps.filter((followUp) =>
      brokerUserIds.has(followUp.user_id),
    );

    const pendingFollowUps = followUps.filter(
      (followUp) => followUp.status === "pending",
    );

    let overdueFollowUps = 0;
    for (const followUp of pendingFollowUps) {
      if (getFollowUpBucket(followUp.due_at) === "overdue") {
        overdueFollowUps += 1;
      }
    }

    const opportunities = raw.opportunities.filter((opportunity) =>
      brokerUserIds.has(opportunity.user_id),
    );

    return {
      officeId,
      officeName: officeId
        ? officeNameById.get(officeId) ?? UNASSIGNED_OFFICE_LABEL
        : UNASSIGNED_OFFICE_LABEL,
      totalBrokers: brokerUserIds.size,
      totalCompanies: companies.length,
      totalActivities: activities.length,
      totalFollowUps: pendingFollowUps.length,
      overdueFollowUps,
      openOpportunities: opportunities.filter((opportunity) =>
        isOpenOpportunityStage(opportunity.status),
      ).length,
      quotedOpportunities: opportunities.filter(
        (opportunity) => opportunity.status === "quoted",
      ).length,
      wonOpportunities: opportunities.filter(
        (opportunity) => opportunity.status === "won",
      ).length,
    };
  });

  if (officeFilter === "all") {
    return summaries;
  }

  if (officeFilter === "unassigned") {
    return summaries.filter((summary) => summary.officeId === null);
  }

  return summaries.filter((summary) => summary.officeId === officeFilter);
}

function buildOverviewKpis(
  raw: RawCrmData,
  brokerRows: BrokerProductivityRow[],
): AdminOverviewKpis {
  const { start: weekStart } = getWeekBounds();
  const pendingFollowUps = raw.followUps.filter(
    (followUp) => followUp.status === "pending",
  );

  let followUpsDueToday = 0;
  let overdueFollowUps = 0;

  for (const followUp of pendingFollowUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "today") followUpsDueToday += 1;
    if (bucket === "overdue") overdueFollowUps += 1;
  }

  const openOpportunities = raw.opportunities.filter((opportunity) =>
    isOpenOpportunityStage(opportunity.status),
  );

  return {
    totalBrokers: brokerRows.length,
    activeBrokers: brokerRows.filter((row) => row.isActive).length,
    totalCompanies: raw.companies.length,
    totalContacts: raw.contacts.length,
    totalOpenFollowUps: pendingFollowUps.length,
    followUpsDueToday,
    overdueFollowUps,
    followUpsCompletedThisWeek: raw.followUps.filter((followUp) => {
      if (followUp.status !== "completed" || !followUp.completed_at) {
        return false;
      }
      return new Date(followUp.completed_at) >= weekStart;
    }).length,
    totalOpportunities: raw.opportunities.length,
    openOpportunities: openOpportunities.length,
    wonOpportunities: raw.opportunities.filter(
      (opportunity) => opportunity.status === "won",
    ).length,
    lostOpportunities: raw.opportunities.filter(
      (opportunity) => opportunity.status === "lost",
    ).length,
    estimatedOpenPipelineValue: openOpportunities.reduce(
      (sum, opportunity) => sum + getOpportunityPipelineValue(opportunity),
      0,
    ),
    highPriorityCompanies: raw.companies.filter((company) =>
      isHighPriority(company.priority),
    ).length,
  };
}

function buildNeedsAttention(
  raw: RawCrmData,
  brokerRows: BrokerProductivityRow[],
): AdminOverviewData["needsAttention"] {
  const companyById = new Map(
    raw.companies.map((company) => [company.id, company]),
  );
  const profileById = new Map(
    raw.profiles.map((profile) => [profile.id, profile]),
  );

  const brokers = brokerRows
    .filter((row) => row.overdueFollowUps >= 3)
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      reason: `${row.overdueFollowUps} overdue follow-ups`,
      overdueFollowUps: row.overdueFollowUps,
    }));

  const inactiveBrokers = brokerRows
    .filter((row) => row.activities7d === 0)
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      reason: "No activity in the last 7 days",
      overdueFollowUps: row.overdueFollowUps,
    }));

  const overdueByCompany = new Map<string, number>();
  for (const followUp of raw.followUps) {
    if (followUp.status !== "pending") continue;
    if (getFollowUpBucket(followUp.due_at) !== "overdue") continue;
    overdueByCompany.set(
      followUp.company_id,
      (overdueByCompany.get(followUp.company_id) ?? 0) + 1,
    );
  }

  const companies: NeedsAttentionCompany[] = [...overdueByCompany.entries()]
    .map(([companyId, count]) => {
      const company = companyById.get(companyId);
      if (!company) return null;
      const profile = profileById.get(company.user_id);
      return {
        companyId,
        companyName: company.name,
        brokerName: profile
          ? getProfileDisplayName(profile as UserProfile)
          : "Unknown broker",
        overdueFollowUpCount: count,
      };
    })
    .filter((item): item is NeedsAttentionCompany => item !== null)
    .sort((a, b) => b.overdueFollowUpCount - a.overdueFollowUpCount)
    .slice(0, 10);

  const stuckCutoff = getCutoffDays(14);
  const opportunities: NeedsAttentionOpportunity[] = raw.opportunities
    .filter((opportunity) => isOpenOpportunityStage(opportunity.status))
    .map((opportunity) => {
      const company = companyById.get(opportunity.company_id);
      if (!company) return null;

      const lastActivity = company.last_contact_at;
      const isStuck =
        !lastActivity || new Date(lastActivity) < stuckCutoff;

      if (!isStuck) return null;

      const profile = profileById.get(opportunity.user_id);
      const daysSinceActivity = lastActivity
        ? Math.max(
            1,
            Math.ceil(
              (Date.now() - new Date(lastActivity).getTime()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : null;

      return {
        opportunityId: opportunity.id,
        opportunityName: opportunity.name || "Load opportunity",
        companyId: company.id,
        companyName: company.name,
        brokerName: profile
          ? getProfileDisplayName(profile as UserProfile)
          : "Unknown broker",
        status: opportunity.status,
        daysSinceActivity,
      };
    })
    .filter((item): item is NeedsAttentionOpportunity => item !== null)
    .slice(0, 10);

  return {
    brokers,
    inactiveBrokers,
    companies,
    opportunities,
  };
}

function buildCommercialPulse(raw: RawCrmData): AdminOverviewData["commercialPulse"] {
  const companyById = new Map(
    raw.companies.map((company) => [company.id, company]),
  );
  const profileById = new Map(
    raw.profiles.map((profile) => [profile.id, profile]),
  );

  const recentActivities: CommercialPulseActivity[] = raw.activities
    .slice(0, 12)
    .map((activity) => {
      const company = companyById.get(activity.company_id);
      const profile = profileById.get(activity.user_id);
      return {
        id: activity.id,
        companyId: activity.company_id,
        companyName: company?.name ?? "Unknown company",
        brokerName: profile
          ? getProfileDisplayName(profile as UserProfile)
          : "Unknown broker",
        activityType: activity.activity_type,
        activityAt: activity.activity_at,
        preview: buildActivityPreview(activity.subject, activity.notes),
      };
    });

  const recentOpportunities: CommercialPulseOpportunity[] = [...raw.opportunities]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 10)
    .map((opportunity) => {
      const company = companyById.get(opportunity.company_id);
      const profile = profileById.get(opportunity.user_id);
      return {
        id: opportunity.id,
        companyId: opportunity.company_id,
        companyName: company?.name ?? "Unknown company",
        brokerName: profile
          ? getProfileDisplayName(profile as UserProfile)
          : "Unknown broker",
        name: opportunity.name || "Load opportunity",
        status: opportunity.status,
        createdAt: opportunity.created_at,
      };
    });

  const completedFollowUps: CommercialPulseFollowUp[] = raw.followUps
    .filter(
      (followUp) => followUp.status === "completed" && followUp.completed_at,
    )
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() -
        new Date(a.completed_at ?? 0).getTime(),
    )
    .slice(0, 10)
    .map((followUp) => {
      const company = companyById.get(followUp.company_id);
      const profile = profileById.get(followUp.user_id);
      return {
        id: followUp.id,
        companyId: followUp.company_id,
        companyName: company?.name ?? "Unknown company",
        brokerName: profile
          ? getProfileDisplayName(profile as UserProfile)
          : "Unknown broker",
        title: followUp.title,
        completedAt: followUp.completed_at ?? "",
      };
    });

  return {
    recentActivities,
    recentOpportunities,
    completedFollowUps,
  };
}

export function buildAdminOverview(
  raw: RawCrmData,
  officeFilter: AdminOfficeFilter = "all",
): AdminOverviewData {
  const scoped = filterRawCrmDataByOffice(raw, officeFilter);
  const brokerProductivity = buildBrokerProductivityRows(
    scoped,
    officeFilter,
  ).sort((a, b) => b.productivityScore - a.productivityScore);
  const officeSummaries = buildOfficeProductivitySummaries(
    scoped,
    brokerProductivity,
    officeFilter,
  );

  return {
    kpis: buildOverviewKpis(scoped, brokerProductivity),
    brokerProductivity,
    officeSummaries,
    offices: raw.offices.map((office) => ({
      id: office.id,
      name: office.name,
      city: office.city,
      isActive: office.is_active ?? true,
    })),
    needsAttention: buildNeedsAttention(scoped, brokerProductivity),
    commercialPulse: buildCommercialPulse(scoped),
  };
}

export async function fetchAdminDashboardSource(): Promise<{
  data: RawCrmData | null;
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: null,
      error: { message: "Admin access required." },
    };
  }

  return fetchRawCrmData();
}

export async function fetchAdminOverview(
  officeFilter: AdminOfficeFilter = "all",
): Promise<{
  data: AdminOverviewData | null;
  error: { message?: string } | null;
}> {
  const { data: raw, error } = await fetchAdminDashboardSource();
  if (error || !raw) {
    return { data: null, error };
  }

  return {
    data: buildAdminOverview(raw, officeFilter),
    error: null,
  };
}

export function resolveAdminOfficeFilterLabel(
  officeFilter: AdminOfficeFilter,
  offices: Office[],
): string {
  if (officeFilter === "all") {
    return ALL_OFFICES_LABEL;
  }

  if (officeFilter === "unassigned") {
    return UNASSIGNED_OFFICE_LABEL;
  }

  return offices.find((office) => office.id === officeFilter)?.name ?? officeFilter;
}

export async function fetchBrokerAdminDetail(
  brokerId: string,
): Promise<{
  data: AdminBrokerDetailData | null;
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: null,
      error: { message: "Admin access required." },
    };
  }

  const { data: raw, error } = await fetchRawCrmData();
  if (error || !raw) {
    return { data: null, error };
  }

  const profile = raw.profiles.find((item) => item.id === brokerId);
  if (!profile || !isBrokerProductivityEligibleRole(profile.role)) {
    return { data: null, error: { message: "User not found." } };
  }

  const brokerRows = buildBrokerProductivityRows(raw);
  const metrics =
    brokerRows.find((row) => row.userId === brokerId) ?? null;

  if (!metrics) {
    return { data: null, error: { message: "User not found." } };
  }

  const companies = raw.companies
    .filter((company) => company.user_id === brokerId)
    .map((company) => ({
      id: company.id,
      name: company.name,
      salesStage: company.sales_stage,
      priority: company.priority,
      lastContactAt: company.last_contact_at,
      nextFollowUpAt: company.next_follow_up_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const pendingFollowUps = raw.followUps
    .filter(
      (followUp) =>
        followUp.user_id === brokerId && followUp.status === "pending",
    )
    .sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    );

  let dueToday = 0;
  let overdue = 0;

  for (const followUp of pendingFollowUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "today") dueToday += 1;
    if (bucket === "overdue") overdue += 1;
  }

  const { start: weekStart } = getWeekBounds();
  const completedThisWeek = raw.followUps.filter((followUp) => {
    if (followUp.user_id !== brokerId || followUp.status !== "completed") {
      return false;
    }
    if (!followUp.completed_at) return false;
    return new Date(followUp.completed_at) >= weekStart;
  }).length;

  const brokerOpportunities = raw.opportunities.filter(
    (opportunity) => opportunity.user_id === brokerId,
  );

  const statusCounts = new Map<string, number>();
  for (const opportunity of brokerOpportunities) {
    statusCounts.set(
      opportunity.status,
      (statusCounts.get(opportunity.status) ?? 0) + 1,
    );
  }

  const recentActivities = raw.activities
    .filter((activity) => activity.user_id === brokerId)
    .slice(0, 15)
    .map((activity) => ({
      id: activity.id,
      companyId: activity.company_id,
      companyName:
        companyById.get(activity.company_id)?.name ?? "Unknown company",
      brokerName: metrics.name,
      activityType: activity.activity_type,
      activityAt: activity.activity_at,
      preview: buildActivityPreview(activity.subject, activity.notes),
    }));

  const needsAttention: AdminBrokerDetailData["needsAttention"] = [];

  for (const followUp of pendingFollowUps) {
    if (getFollowUpBucket(followUp.due_at) !== "overdue") continue;
    const company = companyById.get(followUp.company_id);
    needsAttention.push({
      kind: "overdue_follow_up",
      title: company?.name ?? "Company follow-up",
      detail: `Overdue: ${followUp.title}`,
      href: `/companies/${followUp.company_id}`,
    });
  }

  const stuckCutoff = getCutoffDays(14);
  for (const company of companies) {
    if (!company.lastContactAt || new Date(company.lastContactAt) < stuckCutoff) {
      needsAttention.push({
        kind: "inactive_company",
        title: company.name,
        detail: company.lastContactAt
          ? "No recent contact in the last 14 days"
          : "No contact activity recorded",
        href: `/companies/${company.id}`,
      });
    }
  }

  for (const opportunity of brokerOpportunities) {
    if (!isOpenOpportunityStage(opportunity.status)) continue;
    const company = companyById.get(opportunity.company_id);
    if (!company) continue;
    const lastActivity = company.lastContactAt;
    if (lastActivity && new Date(lastActivity) >= stuckCutoff) continue;

    needsAttention.push({
      kind: "stuck_opportunity",
      title: opportunity.name || "Load opportunity",
      detail: `Open ${opportunity.status} opportunity needs attention`,
      href: `/opportunities/${opportunity.id}`,
    });
  }

  return {
    data: {
      profile: {
        id: profile.id,
        name: metrics.name,
        email: profile.email ?? "—",
        role: normalizeUserRole(profile.role),
        isActive: profile.is_active ?? true,
      },
      metrics,
      companies,
      followUps: {
        dueToday,
        overdue,
        completedThisWeek,
        pending: pendingFollowUps.slice(0, 20).map((followUp) => ({
          id: followUp.id,
          title: followUp.title,
          dueAt: followUp.due_at,
          status: followUp.status,
          companyId: followUp.company_id,
          companyName:
            companyById.get(followUp.company_id)?.name ?? "Unknown company",
        })),
      },
      opportunities: {
        open: metrics.openOpportunities,
        won: metrics.wonOpportunities,
        lost: metrics.lostOpportunities,
        byStatus: [...statusCounts.entries()].map(([status, count]) => ({
          status,
          count,
        })),
        recent: brokerOpportunities
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )
          .slice(0, 10)
          .map((opportunity) => ({
            id: opportunity.id,
            name: opportunity.name || "Load opportunity",
            status: opportunity.status,
            companyId: opportunity.company_id,
            companyName:
              companyById.get(opportunity.company_id)?.name ??
              "Unknown company",
            pipelineValue: getOpportunityPipelineValue(opportunity),
          })),
      },
      recentActivities,
      needsAttention: needsAttention.slice(0, 15),
    },
    error: null,
  };
}

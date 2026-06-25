import {
  DEFAULT_SALES_STAGE,
  isSalesStage,
  OPEN_OPPORTUNITY_STATUSES,
  normalizeOpportunityStage,
  type ActivityType,
  type CompanyPriority,
  type LoadOpportunityStatus,
  type SalesStage,
} from "@/lib/crmConstants";
import {
  bucketFollowUpsWithCompanies,
  fetchPendingFollowUpsWithCompanies,
  getDayBounds,
  type FollowUpWithCompany,
} from "@/lib/followUps";
import {
  fetchLoadOpportunitiesWithCompanies,
  formatLane,
  formatOpportunityRate,
  type LoadOpportunityWithCompany,
} from "@/lib/loadOpportunities";
import { supabase } from "@/lib/supabaseClient";

const HIGH_PRIORITY_INACTIVITY_DAYS = 7;
const RECENT_ACTIVITY_DAYS = 7;
const LIST_LIMIT = 10;

export { LIST_LIMIT };

export interface CompanyDashboardRow {
  id: string;
  name: string;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

export interface FollowUpDashboardItem extends FollowUpWithCompany {
  contactName: string | null;
  followUpNote: string;
  companyPriority: CompanyPriority;
}

export interface RecentActivityItem {
  id: string;
  companyId: string;
  companyName: string;
  activityType: ActivityType | string;
  activityAt: string;
  preview: string;
}

export interface HighPriorityCompanyItem {
  id: string;
  name: string;
  priority: CompanyPriority;
  lastActivityAt: string | null;
  nextFollowUpAt: string | null;
  reason: string;
}

export interface OpenOpportunityDashboardItem {
  id: string;
  companyId: string;
  companyName: string;
  laneLabel: string;
  title: string;
  status: LoadOpportunityStatus;
  estimatedValue: string | null;
}

export interface ActionPlanItem {
  id: string;
  kind: "overdue" | "today" | "high_priority" | "opportunity";
  title: string;
  detail: string;
  href: string;
}

export interface BrokerDashboardData {
  companies: CompanyDashboardRow[];
  followUps: FollowUpDashboardItem[];
  overdue: FollowUpDashboardItem[];
  dueToday: FollowUpDashboardItem[];
  highPriorityCompanies: HighPriorityCompanyItem[];
  openOpportunities: OpenOpportunityDashboardItem[];
  recentActivities: RecentActivityItem[];
  actionPlan: ActionPlanItem[];
  metrics: {
    companyCount: number;
    dueTodayCount: number;
    overdueCount: number;
    openOpportunityCount: number;
    wonOpportunityCount: number;
    lostOpportunityCount: number;
    hotPriorityCount: number;
    recentActivityCount7d: number;
    lastActivityDate: string | null;
  };
}

interface ActivityRow {
  id: string;
  company_id: string;
  activity_type: string;
  subject: string | null;
  notes: string | null;
  activity_at: string;
}

interface ContactRow {
  company_id: string;
  first_name: string;
  last_name: string | null;
  is_primary: boolean;
}

function isHighPriorityLevel(priority: CompanyPriority): boolean {
  return priority === "High" || priority === "Hot Lead";
}

function latestActivityDate(
  company: CompanyDashboardRow,
  activityByCompany: Map<string, string>,
): string | null {
  const fromActivities = activityByCompany.get(company.id) ?? null;
  const fromCompany = company.last_contact_at;

  if (!fromActivities) return fromCompany;
  if (!fromCompany) return fromActivities;

  return new Date(fromActivities) > new Date(fromCompany)
    ? fromActivities
    : fromCompany;
}

function getInactivityCutoff(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

export function getDaysOverdue(dueAt: string): number {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 0;

  const { start } = getDayBounds();
  const diffMs = start.getTime() - due.getTime();
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function formatContactName(
  firstName: string,
  lastName: string | null,
): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildContactNameByCompany(
  contacts: ContactRow[],
): Map<string, string> {
  const byCompany = new Map<string, ContactRow[]>();

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

function getRecentActivityCutoff(): Date {
  return getInactivityCutoff(RECENT_ACTIVITY_DAYS);
}

function buildActivityPreview(activity: ActivityRow): string {
  const subject = activity.subject?.trim();
  const notes = activity.notes?.trim();

  if (subject && notes) {
    return `${subject} — ${notes}`;
  }

  return subject || notes || "No details recorded";
}

function buildCompanyMaps(companies: CompanyDashboardRow[]) {
  const priorityByCompany = new Map<string, CompanyPriority>();
  const nameByCompany = new Map<string, string>();

  for (const company of companies) {
    priorityByCompany.set(company.id, company.priority);
    nameByCompany.set(company.id, company.name);
  }

  return { priorityByCompany, nameByCompany };
}

function enrichFollowUps(
  followUps: FollowUpWithCompany[],
  contactNameByCompany: Map<string, string>,
  priorityByCompany: Map<string, CompanyPriority>,
): FollowUpDashboardItem[] {
  return followUps.map((followUp) => ({
    ...followUp,
    contactName: contactNameByCompany.get(followUp.company_id) ?? null,
    followUpNote: followUp.notes?.trim() || followUp.title,
    companyPriority:
      priorityByCompany.get(followUp.company_id) ?? ("Medium" as CompanyPriority),
  }));
}

function buildHighPriorityReason(
  company: CompanyDashboardRow,
  lastActivityAt: string | null,
  hasPendingFollowUp: boolean,
): string | null {
  if (isHighPriorityLevel(company.priority)) {
    return `${company.priority} priority account`;
  }

  if (!company.next_follow_up_at && !hasPendingFollowUp) {
    return "No follow-up scheduled";
  }

  const cutoff = getInactivityCutoff(HIGH_PRIORITY_INACTIVITY_DAYS);
  if (!lastActivityAt) {
    return "No recent activity recorded";
  }

  if (new Date(lastActivityAt) < cutoff) {
    return `No activity in the last ${HIGH_PRIORITY_INACTIVITY_DAYS} days`;
  }

  return null;
}

function buildHighPriorityCompanies(
  companies: CompanyDashboardRow[],
  activityByCompany: Map<string, string>,
  pendingFollowUpCompanyIds: Set<string>,
): HighPriorityCompanyItem[] {
  return companies
    .map((company) => {
      const lastActivityAt = latestActivityDate(company, activityByCompany);
      const hasPendingFollowUp = pendingFollowUpCompanyIds.has(company.id);
      const reason = buildHighPriorityReason(
        company,
        lastActivityAt,
        hasPendingFollowUp,
      );

      if (!reason) {
        return null;
      }

      return {
        id: company.id,
        name: company.name,
        priority: company.priority,
        lastActivityAt,
        nextFollowUpAt: company.next_follow_up_at,
        reason,
      };
    })
    .filter((item): item is HighPriorityCompanyItem => item !== null)
    .sort((a, b) => {
      const aHot = isHighPriorityLevel(a.priority) ? 0 : 1;
      const bHot = isHighPriorityLevel(b.priority) ? 0 : 1;
      if (aHot !== bHot) return aHot - bHot;

      if (!a.lastActivityAt && !b.lastActivityAt) {
        return a.name.localeCompare(b.name);
      }
      if (!a.lastActivityAt) return -1;
      if (!b.lastActivityAt) return 1;

      return (
        new Date(a.lastActivityAt).getTime() -
        new Date(b.lastActivityAt).getTime()
      );
    });
}

function mapOpenOpportunity(
  opportunity: LoadOpportunityWithCompany,
): OpenOpportunityDashboardItem {
  const laneLabel = formatLane(
    opportunity.lane_origin,
    opportunity.lane_destination,
  );
  const title = opportunity.name?.trim() || opportunity.commodity?.trim() || laneLabel;
  const estimatedValue =
    opportunity.quoted_rate ?? opportunity.target_rate ?? null;

  return {
    id: opportunity.id,
    companyId: opportunity.company_id,
    companyName: opportunity.companyName,
    laneLabel,
    title,
    status: opportunity.status,
    estimatedValue:
      estimatedValue !== null ? formatOpportunityRate(estimatedValue) : null,
  };
}

function buildActionPlan(input: {
  overdue: FollowUpDashboardItem[];
  dueToday: FollowUpDashboardItem[];
  highPriorityCompanies: HighPriorityCompanyItem[];
  openOpportunities: OpenOpportunityDashboardItem[];
}): ActionPlanItem[] {
  const items: ActionPlanItem[] = [];

  for (const followUp of input.overdue.slice(0, 4)) {
    items.push({
      id: `overdue-${followUp.id}`,
      kind: "overdue",
      title: followUp.companyName,
      detail: `Overdue follow-up: ${followUp.followUpNote}`,
      href: "/follow-ups",
    });
  }

  for (const followUp of input.dueToday.slice(0, 4)) {
    items.push({
      id: `today-${followUp.id}`,
      kind: "today",
      title: followUp.companyName,
      detail: `Due today: ${followUp.followUpNote}`,
      href: "/follow-ups",
    });
  }

  for (const company of input.highPriorityCompanies.slice(0, 4)) {
    items.push({
      id: `priority-${company.id}`,
      kind: "high_priority",
      title: company.name,
      detail: company.reason,
      href: `/companies/${company.id}`,
    });
  }

  for (const opportunity of input.openOpportunities.slice(0, 4)) {
    items.push({
      id: `opportunity-${opportunity.id}`,
      kind: "opportunity",
      title: opportunity.companyName,
      detail: `${opportunity.status} opportunity: ${opportunity.title}`,
      href: `/companies/${opportunity.companyId}`,
    });
  }

  return items.slice(0, 10);
}

export async function fetchBrokerDashboardData(
  userId: string,
): Promise<{ data: BrokerDashboardData | null; error: { message?: string } | null }> {
  const [
    companiesResult,
    followUpsResult,
    activitiesResult,
    contactsResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, priority, sales_stage, last_contact_at, next_follow_up_at",
      )
      .eq("user_id", userId),
    fetchPendingFollowUpsWithCompanies(userId),
    supabase
      .from("activities")
      .select("id, company_id, activity_type, subject, notes, activity_at")
      .eq("user_id", userId)
      .order("activity_at", { ascending: false })
      .limit(50),
    supabase
      .from("contacts")
      .select("company_id, first_name, last_name, is_primary")
      .eq("user_id", userId),
    fetchLoadOpportunitiesWithCompanies(userId),
  ]);

  if (companiesResult.error) {
    return { data: null, error: companiesResult.error };
  }

  if (followUpsResult.error) {
    return { data: null, error: followUpsResult.error };
  }

  if (activitiesResult.error) {
    return { data: null, error: activitiesResult.error };
  }

  if (contactsResult.error) {
    return { data: null, error: contactsResult.error };
  }

  if (opportunitiesResult.error) {
    return { data: null, error: opportunitiesResult.error };
  }

  const companies = ((companiesResult.data ?? []) as Array<
    Omit<CompanyDashboardRow, "sales_stage" | "priority"> & {
      sales_stage: string;
      priority: CompanyPriority;
    }
  >).map((company) => ({
    ...company,
    sales_stage: isSalesStage(company.sales_stage)
      ? company.sales_stage
      : DEFAULT_SALES_STAGE,
  }));

  const { priorityByCompany, nameByCompany } = buildCompanyMaps(companies);
  const activities = (activitiesResult.data as ActivityRow[]) ?? [];
  const contactNameByCompany = buildContactNameByCompany(
    (contactsResult.data as ContactRow[]) ?? [],
  );
  const followUps = enrichFollowUps(
    followUpsResult.data,
    contactNameByCompany,
    priorityByCompany,
  );
  const buckets = bucketFollowUpsWithCompanies(followUps);
  const overdue = enrichFollowUps(
    buckets.overdue,
    contactNameByCompany,
    priorityByCompany,
  );
  const dueToday = enrichFollowUps(
    buckets.today,
    contactNameByCompany,
    priorityByCompany,
  );

  const activityByCompany = new Map<string, string>();
  for (const activity of activities) {
    if (!activityByCompany.has(activity.company_id)) {
      activityByCompany.set(activity.company_id, activity.activity_at);
    }
  }

  const recentActivityCutoff = getRecentActivityCutoff();
  const recentActivityCount7d = activities.filter(
    (activity) => new Date(activity.activity_at) >= recentActivityCutoff,
  ).length;

  const recentActivities: RecentActivityItem[] = activities
    .slice(0, 20)
    .map((activity) => ({
      id: activity.id,
      companyId: activity.company_id,
      companyName: nameByCompany.get(activity.company_id) ?? "Unknown company",
      activityType: activity.activity_type,
      activityAt: activity.activity_at,
      preview: buildActivityPreview(activity),
    }));

  const pendingFollowUpCompanyIds = new Set(
    followUps.map((followUp) => followUp.company_id),
  );

  const highPriorityCompanies = buildHighPriorityCompanies(
    companies,
    activityByCompany,
    pendingFollowUpCompanyIds,
  );

  const openOpportunities = (opportunitiesResult.data ?? [])
    .filter((opportunity) =>
      OPEN_OPPORTUNITY_STATUSES.includes(
        normalizeOpportunityStage(opportunity.status),
      ),
    )
    .map(mapOpenOpportunity);

  const actionPlan = buildActionPlan({
    overdue,
    dueToday,
    highPriorityCompanies,
    openOpportunities,
  });

  let lastActivityDate: string | null = null;
  for (const activityAt of activityByCompany.values()) {
    if (!lastActivityDate || new Date(activityAt) > new Date(lastActivityDate)) {
      lastActivityDate = activityAt;
    }
  }

  for (const company of companies) {
    if (
      company.last_contact_at &&
      (!lastActivityDate ||
        new Date(company.last_contact_at) > new Date(lastActivityDate))
    ) {
      lastActivityDate = company.last_contact_at;
    }
  }

  return {
    data: {
      companies,
      followUps,
      overdue,
      dueToday,
      highPriorityCompanies,
      openOpportunities,
      recentActivities,
      actionPlan,
      metrics: {
        companyCount: companies.length,
        dueTodayCount: dueToday.length,
        overdueCount: overdue.length,
        openOpportunityCount: openOpportunities.length,
        wonOpportunityCount: (opportunitiesResult.data ?? []).filter(
          (opportunity) =>
            normalizeOpportunityStage(opportunity.status) === "won",
        ).length,
        lostOpportunityCount: (opportunitiesResult.data ?? []).filter(
          (opportunity) =>
            normalizeOpportunityStage(opportunity.status) === "lost",
        ).length,
        hotPriorityCount: companies.filter((company) =>
          isHighPriorityLevel(company.priority),
        ).length,
        recentActivityCount7d,
        lastActivityDate,
      },
    },
    error: null,
  };
}

export function getTodayHeading(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

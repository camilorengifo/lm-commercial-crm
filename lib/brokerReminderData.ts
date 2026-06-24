import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SALES_STAGE,
  isSalesStage,
  type SalesStage,
} from "@/lib/crmConstants";
import { getFollowUpBucket } from "@/lib/followUps";

const INACTIVITY_DAYS = 14;
const MAX_ITEMS = 10;

export interface BrokerProfile {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface ReminderFollowUpItem {
  title: string;
  companyName: string;
  companyId: string;
  dueAt: string;
}

export interface ReminderCompanyItem {
  companyName: string;
  companyId: string;
  salesStage: SalesStage;
  lastContactAt: string | null;
}

export interface ReminderOpportunityItem {
  companyName: string;
  companyId: string;
  status: string;
  lane: string;
  updatedAt: string;
}

export interface BrokerReminderData {
  userId: string;
  brokerEmail: string;
  brokerName: string | null;
  todayFollowUps: ReminderFollowUpItem[];
  overdueFollowUps: ReminderFollowUpItem[];
  upcomingFollowUps: ReminderFollowUpItem[];
  inactiveCompanies: ReminderCompanyItem[];
  newLeadNoActivity: ReminderCompanyItem[];
  inFollowUpNoPendingFollowUp: ReminderCompanyItem[];
  quotedOpportunities: ReminderOpportunityItem[];
  newOpportunities: ReminderOpportunityItem[];
}

export interface BrokerReminderCounts {
  todayFollowUps: number;
  overdueFollowUps: number;
  upcomingFollowUps: number;
  inactiveCompanies: number;
  newLeadNoActivity: number;
  inFollowUpNoPendingFollowUp: number;
  quotedOpportunities: number;
  newOpportunities: number;
}

interface CompanyRow {
  id: string;
  name: string;
  sales_stage: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

interface FollowUpRow {
  id: string;
  company_id: string;
  title: string;
  due_at: string;
}

interface ActivityRow {
  company_id: string;
  activity_at: string;
}

interface OpportunityRow {
  company_id: string;
  status: string;
  lane_origin: string | null;
  lane_destination: string | null;
  updated_at: string;
  companies: { name: string } | { name: string }[] | null;
}

function formatDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatLane(origin: string | null, destination: string | null): string {
  const from = origin?.trim() || "—";
  const to = destination?.trim() || "—";
  return `${from} → ${to}`;
}

function unwrapCompanyName(
  value: { name: string } | { name: string }[] | null,
): string {
  if (!value) return "Unknown company";
  return Array.isArray(value) ? (value[0]?.name ?? "Unknown company") : value.name;
}

function getInactivityCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function limit<T>(items: T[]): T[] {
  return items.slice(0, MAX_ITEMS);
}

export async function fetchBrokerProfiles(
  supabase: SupabaseClient,
): Promise<BrokerProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_active")
    .eq("is_active", true);

  if (error) throw error;
  return ((data as Array<BrokerProfile & { is_active?: boolean }>) ?? [])
    .filter((profile) => profile.is_active !== false)
    .map(({ id, email, full_name }) => ({ id, email, full_name }));
}

export async function resolveBrokerEmail(
  supabase: SupabaseClient,
  profile: BrokerProfile,
): Promise<string | null> {
  if (profile.email?.trim()) {
    return profile.email.trim();
  }

  const { data, error } = await supabase.auth.admin.getUserById(profile.id);
  if (error || !data.user?.email) {
    return null;
  }

  return data.user.email.trim();
}

export async function buildBrokerReminderData(
  supabase: SupabaseClient,
  userId: string,
  brokerEmail: string,
  brokerName: string | null,
): Promise<BrokerReminderData> {
  const [
    companiesResult,
    followUpsResult,
    activitiesResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, sales_stage, last_contact_at, next_follow_up_at")
      .eq("user_id", userId),
    supabase
      .from("follow_ups")
      .select("id, company_id, title, due_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("due_at", { ascending: true }),
    supabase
      .from("activities")
      .select("company_id, activity_at")
      .eq("user_id", userId)
      .order("activity_at", { ascending: false })
      .limit(300),
    supabase
      .from("load_opportunities")
      .select(
        "company_id, status, lane_origin, lane_destination, updated_at, companies ( name )",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (companiesResult.error) throw companiesResult.error;
  if (followUpsResult.error) throw followUpsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const companies = (companiesResult.data as CompanyRow[]) ?? [];
  const followUps = (followUpsResult.data as FollowUpRow[]) ?? [];
  const activities = (activitiesResult.data as ActivityRow[]) ?? [];
  const opportunities = (opportunitiesResult.data as OpportunityRow[]) ?? [];

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const activityCountByCompany = new Map<string, number>();
  const lastActivityByCompany = new Map<string, string>();
  const companiesWithPendingFollowUp = new Set(
    followUps.map((followUp) => followUp.company_id),
  );

  for (const activity of activities) {
    activityCountByCompany.set(
      activity.company_id,
      (activityCountByCompany.get(activity.company_id) ?? 0) + 1,
    );
    if (!lastActivityByCompany.has(activity.company_id)) {
      lastActivityByCompany.set(activity.company_id, activity.activity_at);
    }
  }

  const mapFollowUp = (followUp: FollowUpRow): ReminderFollowUpItem => ({
    title: followUp.title,
    companyId: followUp.company_id,
    companyName: companyById.get(followUp.company_id)?.name ?? "Unknown company",
    dueAt: formatDateLabel(followUp.due_at) ?? followUp.due_at,
  });

  const todayFollowUps: ReminderFollowUpItem[] = [];
  const overdueFollowUps: ReminderFollowUpItem[] = [];
  const upcomingFollowUps: ReminderFollowUpItem[] = [];

  for (const followUp of followUps) {
    const item = mapFollowUp(followUp);
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "overdue") overdueFollowUps.push(item);
    else if (bucket === "today") todayFollowUps.push(item);
    else upcomingFollowUps.push(item);
  }

  const inactivityCutoff = getInactivityCutoff();

  const inactiveCompanies = limit(
    companies
      .filter((company) => {
        const lastActivity =
          lastActivityByCompany.get(company.id) ?? company.last_contact_at;
        if (!lastActivity) return true;
        return new Date(lastActivity) < inactivityCutoff;
      })
      .map((company) => ({
        companyId: company.id,
        companyName: company.name,
        salesStage: isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE,
        lastContactAt: formatDateLabel(company.last_contact_at),
      })),
  );

  const newLeadNoActivity = limit(
    companies
      .filter((company) => {
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        return (
          stage === "New Lead" &&
          !activityCountByCompany.has(company.id) &&
          !company.last_contact_at
        );
      })
      .map((company) => ({
        companyId: company.id,
        companyName: company.name,
        salesStage: "New Lead" as SalesStage,
        lastContactAt: formatDateLabel(company.last_contact_at),
      })),
  );

  const inFollowUpNoPendingFollowUp = limit(
    companies
      .filter((company) => {
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        return (
          stage === "In Follow-up" &&
          !companiesWithPendingFollowUp.has(company.id)
        );
      })
      .map((company) => ({
        companyId: company.id,
        companyName: company.name,
        salesStage: "In Follow-up" as SalesStage,
        lastContactAt: formatDateLabel(company.last_contact_at),
      })),
  );

  const quotedOpportunities = limit(
    opportunities
      .filter((opportunity) => opportunity.status === "quoted")
      .map((opportunity) => ({
        companyId: opportunity.company_id,
        companyName:
          companyById.get(opportunity.company_id)?.name ??
          unwrapCompanyName(opportunity.companies),
        status: opportunity.status,
        lane: formatLane(
          opportunity.lane_origin,
          opportunity.lane_destination,
        ),
        updatedAt:
          formatDateLabel(opportunity.updated_at) ?? opportunity.updated_at,
      })),
  );

  const newOpportunities = limit(
    opportunities
      .filter((opportunity) => opportunity.status === "prospecting")
      .map((opportunity) => ({
        companyId: opportunity.company_id,
        companyName:
          companyById.get(opportunity.company_id)?.name ??
          unwrapCompanyName(opportunity.companies),
        status: opportunity.status,
        lane: formatLane(
          opportunity.lane_origin,
          opportunity.lane_destination,
        ),
        updatedAt:
          formatDateLabel(opportunity.updated_at) ?? opportunity.updated_at,
      })),
  );

  return {
    userId,
    brokerEmail,
    brokerName,
    todayFollowUps: limit(todayFollowUps),
    overdueFollowUps: limit(overdueFollowUps),
    upcomingFollowUps: limit(upcomingFollowUps),
    inactiveCompanies,
    newLeadNoActivity,
    inFollowUpNoPendingFollowUp,
    quotedOpportunities,
    newOpportunities,
  };
}

export function getBrokerReminderCounts(
  data: BrokerReminderData,
): BrokerReminderCounts {
  return {
    todayFollowUps: data.todayFollowUps.length,
    overdueFollowUps: data.overdueFollowUps.length,
    upcomingFollowUps: data.upcomingFollowUps.length,
    inactiveCompanies: data.inactiveCompanies.length,
    newLeadNoActivity: data.newLeadNoActivity.length,
    inFollowUpNoPendingFollowUp: data.inFollowUpNoPendingFollowUp.length,
    quotedOpportunities: data.quotedOpportunities.length,
    newOpportunities: data.newOpportunities.length,
  };
}

export function buildRuleBasedSuggestedActions(
  data: BrokerReminderData,
): string[] {
  const actions: string[] = [];

  if (data.overdueFollowUps.length > 0) {
    actions.push(
      `Clear ${data.overdueFollowUps.length} overdue follow-up${data.overdueFollowUps.length === 1 ? "" : "s"} first.`,
    );
  }

  if (data.todayFollowUps.length > 0) {
    actions.push(
      `Work through ${data.todayFollowUps.length} follow-up${data.todayFollowUps.length === 1 ? "" : "s"} due today.`,
    );
  }

  if (data.quotedOpportunities.length > 0) {
    actions.push(
      `Follow up on ${data.quotedOpportunities.length} quoted opportunit${data.quotedOpportunities.length === 1 ? "y" : "ies"} while they are still warm.`,
    );
  }

  if (data.inactiveCompanies.length > 0) {
    actions.push(
      `Re-engage ${data.inactiveCompanies.length} account${data.inactiveCompanies.length === 1 ? "" : "s"} with no recent activity.`,
    );
  }

  if (data.newLeadNoActivity.length > 0) {
    actions.push(
      `Make first contact with ${data.newLeadNoActivity.length} new lead${data.newLeadNoActivity.length === 1 ? "" : "s"} that have no activity logged.`,
    );
  }

  if (data.inFollowUpNoPendingFollowUp.length > 0) {
    actions.push(
      `Schedule next steps for ${data.inFollowUpNoPendingFollowUp.length} in follow-up account${data.inFollowUpNoPendingFollowUp.length === 1 ? "" : "s"} without a pending follow-up.`,
    );
  }

  if (data.newOpportunities.length > 0) {
    actions.push(
      `Review ${data.newOpportunities.length} new load opportunit${data.newOpportunities.length === 1 ? "y" : "ies"} and decide whether to quote.`,
    );
  }

  if (actions.length === 0) {
    actions.push(
      "Pipeline looks quiet — use today to prospect, update notes, or advance quoted opportunities.",
    );
  }

  return actions.slice(0, 6);
}

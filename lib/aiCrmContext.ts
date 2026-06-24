import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SALES_STAGE,
  isSalesStage,
  type SalesStage,
} from "@/lib/crmConstants";
import { getFollowUpBucket } from "@/lib/followUps";

const INACTIVITY_DAYS = 14;
const RECENT_OPPORTUNITY_DAYS = 30;
const MAX_LIST_ITEMS = 15;

interface CompanyRow {
  id: string;
  name: string;
  sales_stage: string;
  priority: string;
  city: string | null;
  state: string | null;
  country: string | null;
  general_notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

interface FollowUpRow {
  id: string;
  company_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: string;
  companies: { name: string } | { name: string }[] | null;
}

interface ActivityRow {
  company_id: string;
  activity_type: string;
  subject: string | null;
  activity_at: string;
  companies: { name: string } | { name: string }[] | null;
}

interface OpportunityRow {
  id: string;
  company_id: string;
  status: string;
  lane_origin: string | null;
  lane_destination: string | null;
  equipment_type: string | null;
  commodity: string | null;
  target_rate: number | null;
  quoted_rate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies: { name: string } | { name: string }[] | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
}

function unwrapName(
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

function getRecentOpportunityCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_OPPORTUNITY_DAYS);
  return cutoff;
}

function formatDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isInactive(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  return new Date(lastActivityAt) < getInactivityCutoff();
}

function limit<T>(items: T[]): T[] {
  return items.slice(0, MAX_LIST_ITEMS);
}

export interface BrokerCrmSummary {
  generatedAt: string;
  totals: {
    companies: number;
    contacts: number;
    pendingFollowUps: number;
    activities: number;
    opportunities: number;
  };
  overdueFollowUps: Array<{
    companyName: string;
    title: string;
    dueAt: string;
    notes: string | null;
  }>;
  followUpsDueToday: Array<{
    companyName: string;
    title: string;
    dueAt: string;
  }>;
  inactiveCompanies: Array<{
    companyName: string;
    salesStage: string;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
  }>;
  newLeadNoActivity: Array<{ companyName: string }>;
  inFollowUpNoUpcomingFollowUp: Array<{ companyName: string }>;
  repeatedActivityNoProgress: Array<{
    companyName: string;
    salesStage: string;
    activityCount: number;
  }>;
  quotedOpportunities: Array<{
    companyName: string;
    lane: string;
    quotedRate: number | null;
    updatedAt: string;
  }>;
  newOpportunities: Array<{
    companyName: string;
    lane: string;
    commodity: string | null;
    createdAt: string;
  }>;
  dormantWithRecentOpportunity: Array<{
    companyName: string;
    opportunityStatus: string;
    lane: string;
  }>;
  customersWithoutRecentActivity: Array<{
    companyName: string;
    lastContactAt: string | null;
  }>;
}

export interface AccountCrmSummary {
  generatedAt: string;
  company: {
    name: string;
    salesStage: string;
    priority: string;
    city: string | null;
    state: string | null;
    country: string | null;
    generalNotes: string | null;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
  };
  contacts: Array<{
    name: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    isPrimary: boolean;
  }>;
  pendingFollowUps: Array<{
    title: string;
    dueAt: string;
    notes: string | null;
  }>;
  recentActivities: Array<{
    type: string;
    subject: string | null;
    activityAt: string;
    notes: string | null;
  }>;
  opportunities: Array<{
    status: string;
    lane: string;
    equipmentType: string | null;
    commodity: string | null;
    targetRate: number | null;
    quotedRate: number | null;
    notes: string | null;
    updatedAt: string;
  }>;
}

export async function buildBrokerCrmSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<BrokerCrmSummary> {
  const [
    companiesResult,
    contactsCountResult,
    followUpsResult,
    activitiesResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, sales_stage, priority, city, state, country, general_notes, last_contact_at, next_follow_up_at",
      )
      .eq("user_id", userId),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("follow_ups")
      .select("id, company_id, title, notes, due_at, status, companies ( name )")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("due_at", { ascending: true }),
    supabase
      .from("activities")
      .select(
        "company_id, activity_type, subject, activity_at, companies ( name )",
      )
      .eq("user_id", userId)
      .order("activity_at", { ascending: false })
      .limit(200),
    supabase
      .from("load_opportunities")
      .select(
        "id, company_id, status, lane_origin, lane_destination, equipment_type, commodity, target_rate, quoted_rate, notes, created_at, updated_at, companies ( name )",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  if (companiesResult.error) throw companiesResult.error;
  if (contactsCountResult.error) throw contactsCountResult.error;
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

  for (const activity of activities) {
    activityCountByCompany.set(
      activity.company_id,
      (activityCountByCompany.get(activity.company_id) ?? 0) + 1,
    );

    if (!lastActivityByCompany.has(activity.company_id)) {
      lastActivityByCompany.set(activity.company_id, activity.activity_at);
    }
  }

  const overdueFollowUps = limit(
    followUps
      .filter((followUp) => getFollowUpBucket(followUp.due_at) === "overdue")
      .map((followUp) => ({
        companyName: unwrapName(followUp.companies),
        title: followUp.title,
        dueAt: formatDateLabel(followUp.due_at) ?? followUp.due_at,
        notes: followUp.notes,
      })),
  );

  const followUpsDueToday = limit(
    followUps
      .filter((followUp) => getFollowUpBucket(followUp.due_at) === "today")
      .map((followUp) => ({
        companyName: unwrapName(followUp.companies),
        title: followUp.title,
        dueAt: formatDateLabel(followUp.due_at) ?? followUp.due_at,
      })),
  );

  const inactiveCompanies = limit(
    companies
      .filter((company) => {
        const lastActivity =
          lastActivityByCompany.get(company.id) ?? company.last_contact_at;
        return isInactive(lastActivity);
      })
      .map((company) => ({
        companyName: company.name,
        salesStage: isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE,
        lastContactAt: formatDateLabel(company.last_contact_at),
        nextFollowUpAt: formatDateLabel(company.next_follow_up_at),
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
      .map((company) => ({ companyName: company.name })),
  );

  const inFollowUpNoUpcomingFollowUp = limit(
    companies
      .filter((company) => {
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        return stage === "In Follow-up" && !company.next_follow_up_at;
      })
      .map((company) => ({ companyName: company.name })),
  );

  const repeatedActivityNoProgress = limit(
    companies
      .filter((company) => {
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        const count = activityCountByCompany.get(company.id) ?? 0;
        return (
          count >= 3 &&
          (stage === "New Lead" ||
            stage === "Contacted" ||
            stage === "In Follow-up")
        );
      })
      .map((company) => ({
        companyName: company.name,
        salesStage: isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE,
        activityCount: activityCountByCompany.get(company.id) ?? 0,
      })),
  );

  const formatLane = (
    origin: string | null,
    destination: string | null,
  ): string => {
    const from = origin?.trim() || "—";
    const to = destination?.trim() || "—";
    return `${from} → ${to}`;
  };

  const quotedOpportunities = limit(
    opportunities
      .filter((opportunity) => opportunity.status === "Quoted")
      .map((opportunity) => ({
        companyName: unwrapName(opportunity.companies),
        lane: formatLane(
          opportunity.lane_origin,
          opportunity.lane_destination,
        ),
        quotedRate: opportunity.quoted_rate,
        updatedAt:
          formatDateLabel(opportunity.updated_at) ?? opportunity.updated_at,
      })),
  );

  const newOpportunities = limit(
    opportunities
      .filter((opportunity) => opportunity.status === "New")
      .map((opportunity) => ({
        companyName: unwrapName(opportunity.companies),
        lane: formatLane(
          opportunity.lane_origin,
          opportunity.lane_destination,
        ),
        commodity: opportunity.commodity,
        createdAt:
          formatDateLabel(opportunity.created_at) ?? opportunity.created_at,
      })),
  );

  const recentOpportunityCutoff = getRecentOpportunityCutoff();
  const dormantWithRecentOpportunity = limit(
    opportunities
      .filter((opportunity) => {
        const company = companyById.get(opportunity.company_id);
        if (!company) return false;
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        return (
          stage === "Dormant" &&
          new Date(opportunity.updated_at) >= recentOpportunityCutoff
        );
      })
      .map((opportunity) => ({
        companyName: unwrapName(opportunity.companies),
        opportunityStatus: opportunity.status,
        lane: formatLane(
          opportunity.lane_origin,
          opportunity.lane_destination,
        ),
      })),
  );

  const customersWithoutRecentActivity = limit(
    companies
      .filter((company) => {
        const stage = isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE;
        if (stage !== "Customer") return false;
        const lastActivity =
          lastActivityByCompany.get(company.id) ?? company.last_contact_at;
        return isInactive(lastActivity);
      })
      .map((company) => ({
        companyName: company.name,
        lastContactAt: formatDateLabel(company.last_contact_at),
      })),
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      companies: companies.length,
      contacts: contactsCountResult.count ?? 0,
      pendingFollowUps: followUps.length,
      activities: activities.length,
      opportunities: opportunities.length,
    },
    overdueFollowUps,
    followUpsDueToday,
    inactiveCompanies,
    newLeadNoActivity,
    inFollowUpNoUpcomingFollowUp,
    repeatedActivityNoProgress,
    quotedOpportunities,
    newOpportunities,
    dormantWithRecentOpportunity,
    customersWithoutRecentActivity,
  };
}

export async function buildAccountCrmSummary(
  supabase: SupabaseClient,
  dataOwnerUserId: string,
  companyId: string,
): Promise<AccountCrmSummary | null> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, name, sales_stage, priority, city, state, country, general_notes, last_contact_at, next_follow_up_at",
    )
    .eq("id", companyId)
    .eq("user_id", dataOwnerUserId)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!company) return null;

  const [contactsResult, followUpsResult, activitiesResult, opportunitiesResult] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, job_title, is_primary")
        .eq("company_id", companyId)
        .eq("user_id", dataOwnerUserId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("follow_ups")
        .select("title, notes, due_at, status")
        .eq("company_id", companyId)
        .eq("user_id", dataOwnerUserId)
        .eq("status", "pending")
        .order("due_at", { ascending: true }),
      supabase
        .from("activities")
        .select("activity_type, subject, notes, activity_at")
        .eq("company_id", companyId)
        .eq("user_id", dataOwnerUserId)
        .order("activity_at", { ascending: false })
        .limit(12),
      supabase
        .from("load_opportunities")
        .select(
          "status, lane_origin, lane_destination, equipment_type, commodity, target_rate, quoted_rate, notes, updated_at",
        )
        .eq("company_id", companyId)
        .eq("user_id", dataOwnerUserId)
        .order("updated_at", { ascending: false }),
    ]);

  if (contactsResult.error) throw contactsResult.error;
  if (followUpsResult.error) throw followUpsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const formatLane = (
    origin: string | null,
    destination: string | null,
  ): string => {
    const from = origin?.trim() || "—";
    const to = destination?.trim() || "—";
    return `${from} → ${to}`;
  };

  return {
    generatedAt: new Date().toISOString(),
    company: {
      name: company.name,
      salesStage: isSalesStage(company.sales_stage)
        ? company.sales_stage
        : DEFAULT_SALES_STAGE,
      priority: company.priority,
      city: company.city,
      state: company.state,
      country: company.country,
      generalNotes: company.general_notes,
      lastContactAt: formatDateLabel(company.last_contact_at),
      nextFollowUpAt: formatDateLabel(company.next_follow_up_at),
    },
    contacts: ((contactsResult.data as ContactRow[]) ?? []).map((contact) => ({
      name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
      email: contact.email,
      phone: contact.phone,
      jobTitle: contact.job_title,
      isPrimary: contact.is_primary,
    })),
    pendingFollowUps: (followUpsResult.data ?? []).map((followUp) => ({
      title: followUp.title,
      dueAt: formatDateLabel(followUp.due_at) ?? followUp.due_at,
      notes: followUp.notes,
    })),
    recentActivities: (activitiesResult.data ?? []).map((activity) => ({
      type: activity.activity_type,
      subject: activity.subject,
      activityAt:
        formatDateLabel(activity.activity_at) ?? activity.activity_at,
      notes: activity.notes,
    })),
    opportunities: ((opportunitiesResult.data as OpportunityRow[]) ?? []).map(
      (opportunity) => ({
        status: opportunity.status,
        lane: formatLane(opportunity.lane_origin, opportunity.lane_destination),
        equipmentType: opportunity.equipment_type,
        commodity: opportunity.commodity,
        targetRate: opportunity.target_rate,
        quotedRate: opportunity.quoted_rate,
        notes: opportunity.notes,
        updatedAt:
          formatDateLabel(opportunity.updated_at) ?? opportunity.updated_at,
      }),
    ),
  };
}

export interface OutreachCrmContext {
  generatedAt: string;
  outreachType: string;
  tone: string;
  goal: string | null;
  selectedContact: {
    name: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
  } | null;
  company: AccountCrmSummary["company"];
  contacts: AccountCrmSummary["contacts"];
  pendingFollowUps: AccountCrmSummary["pendingFollowUps"];
  completedFollowUps: Array<{
    title: string;
    completedAt: string | null;
    notes: string | null;
  }>;
  recentActivities: AccountCrmSummary["recentActivities"];
  opportunities: AccountCrmSummary["opportunities"];
}

export async function buildOutreachCrmContext(
  supabase: SupabaseClient,
  dataOwnerUserId: string,
  companyId: string,
  input: {
    outreachType: string;
    tone: string;
    goal: string | null;
    contactId: string | null;
  },
): Promise<OutreachCrmContext | null> {
  const baseSummary = await buildAccountCrmSummary(
    supabase,
    dataOwnerUserId,
    companyId,
  );
  if (!baseSummary) return null;

  const { data: allFollowUps, error: followUpsError } = await supabase
    .from("follow_ups")
    .select("title, notes, due_at, status, completed_at")
    .eq("company_id", companyId)
    .eq("user_id", dataOwnerUserId)
    .order("due_at", { ascending: false })
    .limit(20);

  if (followUpsError) throw followUpsError;

  let selectedContact: OutreachCrmContext["selectedContact"] = null;

  if (input.contactId) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("first_name, last_name, email, phone, job_title")
      .eq("id", input.contactId)
      .eq("company_id", companyId)
      .eq("user_id", dataOwnerUserId)
      .maybeSingle();

    if (contactError) throw contactError;

    if (contact) {
      selectedContact = {
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
        email: contact.email,
        phone: contact.phone,
        jobTitle: contact.job_title,
      };
    }
  }

  const completedFollowUps = (allFollowUps ?? [])
    .filter((followUp) => followUp.status === "completed")
    .slice(0, 8)
    .map((followUp) => ({
      title: followUp.title,
      completedAt: formatDateLabel(followUp.completed_at),
      notes: followUp.notes,
    }));

  return {
    generatedAt: new Date().toISOString(),
    outreachType: input.outreachType,
    tone: input.tone,
    goal: input.goal,
    selectedContact,
    company: baseSummary.company,
    contacts: baseSummary.contacts,
    pendingFollowUps: baseSummary.pendingFollowUps,
    completedFollowUps,
    recentActivities: baseSummary.recentActivities,
    opportunities: baseSummary.opportunities,
  };
}

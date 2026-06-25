import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenOpportunityStage } from "@/lib/crmConstants";
import { getFollowUpBucket } from "@/lib/followUps";
import { getOpportunityPipelineValue } from "@/lib/brokerProductivity";

const INACTIVITY_DAYS = 14;
const MEANINGFUL_PIPELINE_VALUE = 500;

interface CompanyRow {
  id: string;
  name: string;
  user_id: string;
  sales_stage: string;
  priority: string;
  general_notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

interface ContactRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  is_primary: boolean;
}

interface FollowUpRow {
  id: string;
  company_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: string;
}

interface ActivityRow {
  company_id: string;
  activity_type: string;
  subject: string | null;
  activity_at: string;
}

interface OpportunityRow {
  company_id: string;
  status: string;
  estimated_revenue_usd: number | null;
  quoted_rate: number | null;
  target_rate: number | null;
}

export interface PrioritizedAccountContact {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
}

export interface PrioritizedAccount {
  companyId: string;
  companyName: string;
  userId: string;
  priorityScore: number;
  priorityReasons: string[];
  recommendedAction: string;
  contacts: PrioritizedAccountContact[];
  contactCount: number;
  lastActivityAt: string | null;
  nextFollowUpAt: string | null;
  overdueFollowUpCount: number;
  dueTodayFollowUpCount: number;
  openOpportunityCount: number;
  openPipelineValue: number;
  latestActivitySummary: string | null;
  salesStage: string;
  priority: string;
  dataQualityIssues: string[];
}

export interface BrokerAssistantFocus {
  openFollowUps: number;
  overdueFollowUps: number;
  dueTodayFollowUps: number;
  openOpportunities: number;
  accountsNeedingAttention: number;
}

export interface BrokerAssistantSnapshot {
  generatedAt: string;
  focus: BrokerAssistantFocus;
  topAccounts: PrioritizedAccount[];
  dataQualitySuggestions: string[];
  hasCrmData: boolean;
}

function getInactivityCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function isInactive(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  return new Date(lastActivityAt) < getInactivityCutoff();
}

function isRecentActivity(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  return new Date(lastActivityAt) >= getInactivityCutoff();
}

function isClosedCompanyStage(stage: string): boolean {
  return stage === "Not Interested" || stage === "Dormant";
}

function isHighPriority(priority: string): boolean {
  return priority === "High" || priority === "Hot Lead";
}

function hasUsefulNotes(notes: string | null): boolean {
  return Boolean(notes?.trim());
}

function formatContactName(contact: ContactRow): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
}

function buildActivitySummary(activity: ActivityRow): string {
  const subject = activity.subject?.trim();
  if (subject) {
    return `${activity.activity_type}: ${subject}`;
  }

  return activity.activity_type;
}

function buildRecommendedAction(input: {
  overdueCount: number;
  dueTodayCount: number;
  openOpportunityCount: number;
  inactive: boolean;
  hasPendingFollowUp: boolean;
  hasRecentActivityNoFollowUp: boolean;
  isClosed: boolean;
}): string {
  if (input.isClosed) {
    return "Review whether this account should stay closed or be re-qualified.";
  }

  if (input.overdueCount > 0) {
    return `Clear ${input.overdueCount} overdue follow-up${input.overdueCount === 1 ? "" : "s"} — call or email today.`;
  }

  if (input.dueTodayCount > 0) {
    return `Complete today's scheduled follow-up${input.dueTodayCount === 1 ? "" : "s"}.`;
  }

  if (input.openOpportunityCount > 0) {
    return "Advance the open load opportunity — confirm lane details and next step.";
  }

  if (input.inactive) {
    return "Re-engage this inactive account with a check-in call or email.";
  }

  if (input.hasRecentActivityNoFollowUp) {
    return "Log outcomes from recent activity and schedule the next follow-up.";
  }

  if (!input.hasPendingFollowUp) {
    return "Schedule a follow-up so this account stays on your radar.";
  }

  return "Review the account, update notes, and plan the next commercial touch.";
}

function buildDataQualityIssues(input: {
  contactCount: number;
  hasNotes: boolean;
  hasPendingFollowUp: boolean;
  nextFollowUpAt: string | null;
  openOpportunityCount: number;
  salesStage: string;
}): string[] {
  const issues: string[] = [];

  if (input.contactCount === 0) {
    issues.push("Add a decision-maker contact");
  }

  if (!input.hasPendingFollowUp && !input.nextFollowUpAt) {
    issues.push("Add a follow-up date");
  }

  if (!input.hasNotes) {
    issues.push("Add notes from your last call or email");
  }

  if (
    input.openOpportunityCount === 0 &&
    (input.salesStage === "Quoted" || input.salesStage === "In Follow-up")
  ) {
    issues.push("Add opportunity value and status");
  }

  return issues;
}

function scoreAccount(input: {
  overdueCount: number;
  dueTodayCount: number;
  openOpportunityCount: number;
  priority: string;
  inactive: boolean;
  contactCount: number;
  hasRecentActivityNoFollowUp: boolean;
  meaningfulPipelineValue: boolean;
  hasUsefulNotes: boolean;
  isClosed: boolean;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (input.overdueCount > 0) {
    score += 25;
    reasons.push(
      `${input.overdueCount} overdue follow-up${input.overdueCount === 1 ? "" : "s"}`,
    );
  }

  if (input.dueTodayCount > 0) {
    score += 20;
    reasons.push(
      `${input.dueTodayCount} follow-up${input.dueTodayCount === 1 ? "" : "s"} due today`,
    );
  }

  if (input.openOpportunityCount > 0) {
    score += 15;
    reasons.push(
      `${input.openOpportunityCount} open opportunit${input.openOpportunityCount === 1 ? "y" : "ies"}`,
    );
  }

  if (isHighPriority(input.priority)) {
    score += 10;
    reasons.push(`Company priority is ${input.priority}`);
  }

  if (input.inactive) {
    score += 10;
    reasons.push("No activity in 14+ days");
  }

  if (input.contactCount > 0) {
    score += 5;
  }

  if (input.hasRecentActivityNoFollowUp) {
    score += 5;
    reasons.push("Recent activity but no follow-up scheduled");
  }

  if (input.meaningfulPipelineValue) {
    score += 10;
    reasons.push("Meaningful open pipeline value");
  }

  if (input.contactCount === 0 && !input.hasUsefulNotes) {
    score -= 10;
    reasons.push("No contacts and no useful notes");
  }

  if (input.isClosed) {
    score -= 15;
    reasons.push("Account is closed or dormant");
  }

  return { score, reasons };
}

export async function fetchBrokerAssistantSnapshot(
  supabase: SupabaseClient,
  userId: string,
  accountLimit = 10,
): Promise<BrokerAssistantSnapshot> {
  const [
    companiesResult,
    contactsResult,
    followUpsResult,
    activitiesResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, user_id, sales_stage, priority, general_notes, last_contact_at, next_follow_up_at",
      )
      .eq("user_id", userId),
    supabase
      .from("contacts")
      .select(
        "id, company_id, first_name, last_name, email, job_title, is_primary",
      )
      .eq("user_id", userId),
    supabase
      .from("follow_ups")
      .select("id, company_id, title, notes, due_at, status")
      .eq("user_id", userId)
      .eq("status", "pending"),
    supabase
      .from("activities")
      .select("company_id, activity_type, subject, activity_at")
      .eq("user_id", userId)
      .order("activity_at", { ascending: false })
      .limit(300),
    supabase
      .from("load_opportunities")
      .select(
        "company_id, status, estimated_revenue_usd, quoted_rate, target_rate",
      )
      .eq("user_id", userId),
  ]);

  if (companiesResult.error) throw companiesResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (followUpsResult.error) throw followUpsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const companies = (companiesResult.data as CompanyRow[]) ?? [];
  const contacts = (contactsResult.data as ContactRow[]) ?? [];
  const followUps = (followUpsResult.data as FollowUpRow[]) ?? [];
  const activities = (activitiesResult.data as ActivityRow[]) ?? [];
  const opportunities = (opportunitiesResult.data as OpportunityRow[]) ?? [];

  const contactsByCompany = new Map<string, ContactRow[]>();
  for (const contact of contacts) {
    const list = contactsByCompany.get(contact.company_id) ?? [];
    list.push(contact);
    contactsByCompany.set(contact.company_id, list);
  }

  const followUpsByCompany = new Map<string, FollowUpRow[]>();
  for (const followUp of followUps) {
    const list = followUpsByCompany.get(followUp.company_id) ?? [];
    list.push(followUp);
    followUpsByCompany.set(followUp.company_id, list);
  }

  const latestActivityByCompany = new Map<string, ActivityRow>();
  for (const activity of activities) {
    if (!latestActivityByCompany.has(activity.company_id)) {
      latestActivityByCompany.set(activity.company_id, activity);
    }
  }

  const openOpportunitiesByCompany = new Map<string, OpportunityRow[]>();
  for (const opportunity of opportunities) {
    if (!isOpenOpportunityStage(opportunity.status)) continue;
    const list = openOpportunitiesByCompany.get(opportunity.company_id) ?? [];
    list.push(opportunity);
    openOpportunitiesByCompany.set(opportunity.company_id, list);
  }

  let overdueFollowUps = 0;
  let dueTodayFollowUps = 0;

  for (const followUp of followUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "overdue") overdueFollowUps += 1;
    if (bucket === "today") dueTodayFollowUps += 1;
  }

  const openOpportunityCount = opportunities.filter((opportunity) =>
    isOpenOpportunityStage(opportunity.status),
  ).length;

  const prioritizedAccounts: PrioritizedAccount[] = companies.map((company) => {
    const companyFollowUps = followUpsByCompany.get(company.id) ?? [];
    const overdueFollowUpCount = companyFollowUps.filter(
      (followUp) => getFollowUpBucket(followUp.due_at) === "overdue",
    ).length;
    const dueTodayFollowUpCount = companyFollowUps.filter(
      (followUp) => getFollowUpBucket(followUp.due_at) === "today",
    ).length;

    const companyContacts = contactsByCompany.get(company.id) ?? [];
    const openOpps = openOpportunitiesByCompany.get(company.id) ?? [];
    const openPipelineValue = openOpps.reduce(
      (sum, opportunity) => sum + getOpportunityPipelineValue(opportunity),
      0,
    );
    const meaningfulPipelineValue = openPipelineValue >= MEANINGFUL_PIPELINE_VALUE;

    const latestActivity = latestActivityByCompany.get(company.id) ?? null;
    const lastActivityAt =
      latestActivity?.activity_at ?? company.last_contact_at ?? null;

    const inactive = isInactive(lastActivityAt);
    const hasPendingFollowUp = companyFollowUps.length > 0;
    const hasRecentActivityNoFollowUp =
      isRecentActivity(lastActivityAt) &&
      !hasPendingFollowUp &&
      !company.next_follow_up_at;

    const isClosed = isClosedCompanyStage(company.sales_stage);
    const { score, reasons } = scoreAccount({
      overdueCount: overdueFollowUpCount,
      dueTodayCount: dueTodayFollowUpCount,
      openOpportunityCount: openOpps.length,
      priority: company.priority,
      inactive,
      contactCount: companyContacts.length,
      hasRecentActivityNoFollowUp,
      meaningfulPipelineValue,
      hasUsefulNotes: hasUsefulNotes(company.general_notes),
      isClosed,
    });

    const sortedContacts = [...companyContacts].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return formatContactName(a).localeCompare(formatContactName(b));
    });

    const nextPendingFollowUp = [...companyFollowUps].sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    )[0];

    const dataQualityIssues = buildDataQualityIssues({
      contactCount: companyContacts.length,
      hasNotes: hasUsefulNotes(company.general_notes),
      hasPendingFollowUp,
      nextFollowUpAt:
        nextPendingFollowUp?.due_at ?? company.next_follow_up_at ?? null,
      openOpportunityCount: openOpps.length,
      salesStage: company.sales_stage,
    });

    return {
      companyId: company.id,
      companyName: company.name,
      userId: company.user_id,
      priorityScore: score,
      priorityReasons: reasons.length > 0 ? reasons : ["Routine account review"],
      recommendedAction: buildRecommendedAction({
        overdueCount: overdueFollowUpCount,
        dueTodayCount: dueTodayFollowUpCount,
        openOpportunityCount: openOpps.length,
        inactive,
        hasPendingFollowUp,
        hasRecentActivityNoFollowUp,
        isClosed,
      }),
      contacts: sortedContacts.map((contact) => ({
        id: contact.id,
        name: formatContactName(contact),
        email: contact.email,
        jobTitle: contact.job_title,
      })),
      contactCount: companyContacts.length,
      lastActivityAt,
      nextFollowUpAt:
        nextPendingFollowUp?.due_at ?? company.next_follow_up_at ?? null,
      overdueFollowUpCount,
      dueTodayFollowUpCount,
      openOpportunityCount: openOpps.length,
      openPipelineValue,
      latestActivitySummary: latestActivity
        ? buildActivitySummary(latestActivity)
        : null,
      salesStage: company.sales_stage,
      priority: company.priority,
      dataQualityIssues,
    };
  });

  prioritizedAccounts.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    return a.companyName.localeCompare(b.companyName);
  });

  const accountsNeedingAttention = prioritizedAccounts.filter(
    (account) => account.priorityScore > 0,
  ).length;

  const dataQualitySuggestions = buildGlobalDataQualitySuggestions(
    prioritizedAccounts,
  );

  return {
    generatedAt: new Date().toISOString(),
    focus: {
      openFollowUps: followUps.length,
      overdueFollowUps,
      dueTodayFollowUps,
      openOpportunities: openOpportunityCount,
      accountsNeedingAttention,
    },
    topAccounts: prioritizedAccounts.slice(0, accountLimit),
    dataQualitySuggestions,
    hasCrmData: companies.length > 0,
  };
}

function buildGlobalDataQualitySuggestions(
  accounts: PrioritizedAccount[],
): string[] {
  const suggestions = new Set<string>();

  let missingContacts = 0;
  let missingFollowUps = 0;
  let missingNotes = 0;
  let missingOpportunities = 0;

  for (const account of accounts) {
    if (account.contactCount === 0) missingContacts += 1;
    if (!account.nextFollowUpAt) missingFollowUps += 1;
    if (account.dataQualityIssues.includes("Add notes from your last call or email")) {
      missingNotes += 1;
    }
    if (
      account.dataQualityIssues.includes("Add opportunity value and status")
    ) {
      missingOpportunities += 1;
    }
  }

  if (missingContacts > 0) {
    suggestions.add(
      `Add a decision-maker contact to ${missingContacts} account${missingContacts === 1 ? "" : "s"} missing contacts.`,
    );
  }

  if (missingFollowUps > 0) {
    suggestions.add(
      `Schedule follow-up dates for ${missingFollowUps} account${missingFollowUps === 1 ? "" : "s"} without a next touch.`,
    );
  }

  if (missingNotes > 0) {
    suggestions.add(
      `Add call or email notes to ${missingNotes} account${missingNotes === 1 ? "" : "s"} so AI can draft better outreach.`,
    );
  }

  if (missingOpportunities > 0) {
    suggestions.add(
      `Add opportunity value and status to ${missingOpportunities} quoted or in-follow-up account${missingOpportunities === 1 ? "" : "s"}.`,
    );
  }

  return Array.from(suggestions);
}

export function summarizePrioritizedAccountsForAi(
  accounts: PrioritizedAccount[],
): Array<Record<string, unknown>> {
  return accounts.slice(0, 10).map((account) => ({
    companyId: account.companyId,
    companyName: account.companyName,
    priorityScore: account.priorityScore,
    priorityReasons: account.priorityReasons,
    recommendedAction: account.recommendedAction,
    contactCount: account.contactCount,
    primaryContact: account.contacts[0]?.name ?? null,
    lastActivityAt: account.lastActivityAt,
    nextFollowUpAt: account.nextFollowUpAt,
    overdueFollowUpCount: account.overdueFollowUpCount,
    openOpportunityCount: account.openOpportunityCount,
    openPipelineValue: account.openPipelineValue,
    latestActivitySummary: account.latestActivitySummary,
    salesStage: account.salesStage,
    priority: account.priority,
    dataQualityIssues: account.dataQualityIssues,
  }));
}

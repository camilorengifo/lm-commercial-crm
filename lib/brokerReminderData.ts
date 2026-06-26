import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPEN_OPPORTUNITY_STATUSES,
  getOpportunityStageLabel,
  type CompanyPriority,
} from "@/lib/crmConstants";
import {
  formatPipelineValue,
  getOpportunityPipelineValue,
} from "@/lib/brokerProductivity";
import { getFollowUpBucket } from "@/lib/followUps";

const SEASONAL_HORIZON_DAYS = 45;
const MAX_TOP_PRIORITIES = 5;
const MAX_OVERDUE = 10;
const MAX_TODAY = 10;
const MAX_SEASONAL = 10;
const MAX_OPEN_OPPORTUNITIES = 10;
const MAX_PRIORITY_ACCOUNTS = 5;

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
  contactName: string | null;
  notes: string | null;
  suggestedAction: string;
}

export interface ReminderSeasonalFollowUpItem {
  companyName: string;
  companyId: string;
  title: string;
  targetDate: string;
  reminderStartDate: string | null;
  seasonalContext: string | null;
  suggestedAction: string;
}

export interface ReminderOpenOpportunityItem {
  companyName: string;
  companyId: string;
  opportunityId: string;
  name: string;
  status: string;
  statusLabel: string;
  value: number;
  valueLabel: string | null;
  expectedCloseDate: string | null;
  nextStep: string | null;
  suggestedAction: string;
}

export interface ReminderPriorityAccountItem {
  companyName: string;
  companyId: string;
  priority: CompanyPriority | string;
  reason: string;
}

export interface ReminderTopPriorityItem {
  label: string;
  action: string;
}

export interface BrokerReminderData {
  userId: string;
  brokerEmail: string;
  brokerName: string | null;
  topPriorities: ReminderTopPriorityItem[];
  overdueFollowUps: ReminderFollowUpItem[];
  todayFollowUps: ReminderFollowUpItem[];
  seasonalFollowUps: ReminderSeasonalFollowUpItem[];
  openOpportunities: ReminderOpenOpportunityItem[];
  priorityAccounts: ReminderPriorityAccountItem[];
  hasMoreOverdue: boolean;
  hasMoreToday: boolean;
  hasMoreSeasonal: boolean;
  hasMoreOpenOpportunities: boolean;
  hasMorePriorityAccounts: boolean;
}

export interface BrokerReminderCounts {
  topPriorities: number;
  overdueFollowUps: number;
  todayFollowUps: number;
  seasonalFollowUps: number;
  openOpportunities: number;
  priorityAccounts: number;
}

interface CompanyRow {
  id: string;
  name: string;
  priority: string;
  sales_stage: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  account_status: string | null;
  deleted_at: string | null;
}

interface FollowUpRow {
  id: string;
  company_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  follow_up_type: string | null;
  reminder_start_date: string | null;
  seasonal_context: string | null;
}

interface ContactRow {
  company_id: string;
  first_name: string;
  last_name: string | null;
  is_primary: boolean;
}

interface OpportunityRow {
  id: string;
  company_id: string;
  name: string;
  status: string;
  lane_origin: string | null;
  lane_destination: string | null;
  estimated_revenue_usd: number | null;
  estimated_margin_usd: number | null;
  quoted_rate: number | null;
  target_rate: number | null;
  expected_close_date: string | null;
  next_step: string | null;
  updated_at: string;
  companies: { name: string } | { name: string }[] | null;
}

function formatDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function unwrapCompanyName(
  value: { name: string } | { name: string }[] | null,
): string {
  if (!value) return "Unknown company";
  return Array.isArray(value) ? (value[0]?.name ?? "Unknown company") : value.name;
}

function getDayBounds(reference: Date = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWorkingCompany(company: CompanyRow | undefined): boolean {
  if (!company) return false;
  if (company.deleted_at) return false;
  const status = company.account_status?.trim().toLowerCase() ?? "active";
  return status !== "archived";
}

function isSeasonalFollowUpType(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "seasonal" || normalized === "future_opportunity";
}

function formatContactName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildContactNameByCompany(contacts: ContactRow[]): Map<string, string> {
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

function shouldIncludeSeasonalFollowUp(
  followUp: FollowUpRow,
  todayStart: Date,
  todayEnd: Date,
  horizonEnd: Date,
): boolean {
  if (!isSeasonalFollowUpType(followUp.follow_up_type)) return false;

  const due = new Date(followUp.due_at);
  if (Number.isNaN(due.getTime()) || due < todayStart) return false;

  if (followUp.reminder_start_date) {
    const reminderStart = new Date(followUp.reminder_start_date);
    if (Number.isNaN(reminderStart.getTime())) return false;
    return reminderStart <= todayEnd && due >= todayStart;
  }

  return due <= horizonEnd;
}

function isHighPriority(priority: string): boolean {
  return priority === "High" || priority === "Hot Lead";
}

function buildFollowUpItem(
  followUp: FollowUpRow,
  companyById: Map<string, CompanyRow>,
  contactNameByCompany: Map<string, string>,
  suggestedAction: string,
): ReminderFollowUpItem | null {
  const company = companyById.get(followUp.company_id);
  if (!isWorkingCompany(company)) return null;

  return {
    title: followUp.title,
    companyId: followUp.company_id,
    companyName: company?.name ?? "Unknown company",
    dueAt: formatDateLabel(followUp.due_at) ?? followUp.due_at,
    contactName: contactNameByCompany.get(followUp.company_id) ?? null,
    notes: followUp.notes?.trim() || null,
    suggestedAction,
  };
}

function buildTopPriorities(data: {
  overdueFollowUps: ReminderFollowUpItem[];
  todayFollowUps: ReminderFollowUpItem[];
  seasonalFollowUps: ReminderSeasonalFollowUpItem[];
  openOpportunities: ReminderOpenOpportunityItem[];
}): ReminderTopPriorityItem[] {
  const priorities: ReminderTopPriorityItem[] = [];

  for (const item of data.overdueFollowUps.slice(0, 2)) {
    priorities.push({
      label: `${item.companyName} — ${item.title}`,
      action: item.suggestedAction,
    });
  }

  for (const item of data.todayFollowUps.slice(0, 2)) {
    priorities.push({
      label: `${item.companyName} — ${item.title}`,
      action: item.suggestedAction,
    });
  }

  for (const item of data.seasonalFollowUps.slice(0, 2)) {
    priorities.push({
      label: `${item.companyName} — ${item.title}`,
      action: item.suggestedAction,
    });
  }

  for (const item of data.openOpportunities.slice(0, 2)) {
    priorities.push({
      label: `${item.companyName} — ${item.name}`,
      action: item.suggestedAction,
    });
  }

  return priorities.slice(0, MAX_TOP_PRIORITIES);
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
    contactsResult,
    opportunitiesResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, priority, sales_stage, last_contact_at, next_follow_up_at, account_status, deleted_at",
      )
      .eq("user_id", userId),
    supabase
      .from("follow_ups")
      .select(
        "id, company_id, title, notes, due_at, follow_up_type, reminder_start_date, seasonal_context",
      )
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("due_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("company_id, first_name, last_name, is_primary")
      .eq("user_id", userId),
    supabase
      .from("load_opportunities")
      .select(
        "id, company_id, name, status, lane_origin, lane_destination, estimated_revenue_usd, estimated_margin_usd, quoted_rate, target_rate, expected_close_date, next_step, updated_at, companies ( name )",
      )
      .eq("user_id", userId)
      .in("status", OPEN_OPPORTUNITY_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (companiesResult.error) throw companiesResult.error;
  if (followUpsResult.error) throw followUpsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const companies = (companiesResult.data as CompanyRow[]) ?? [];
  const followUps = (followUpsResult.data as FollowUpRow[]) ?? [];
  const contacts = (contactsResult.data as ContactRow[]) ?? [];
  const opportunities = (opportunitiesResult.data as OpportunityRow[]) ?? [];

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const workingCompanyIds = new Set(
    companies.filter((company) => isWorkingCompany(company)).map((company) => company.id),
  );
  const contactNameByCompany = buildContactNameByCompany(contacts);

  const { start: todayStart, end: todayEnd } = getDayBounds();
  const horizonEnd = addDays(todayEnd, SEASONAL_HORIZON_DAYS);

  const overdueAll: ReminderFollowUpItem[] = [];
  const todayAll: ReminderFollowUpItem[] = [];
  const seasonalAll: ReminderSeasonalFollowUpItem[] = [];
  const seasonalFollowUpIds = new Set<string>();

  for (const followUp of followUps) {
    const company = companyById.get(followUp.company_id);
    if (!isWorkingCompany(company)) continue;

    if (shouldIncludeSeasonalFollowUp(followUp, todayStart, todayEnd, horizonEnd)) {
      seasonalFollowUpIds.add(followUp.id);
      seasonalAll.push({
        companyId: followUp.company_id,
        companyName: company?.name ?? "Unknown company",
        title: followUp.title,
        targetDate: formatDateLabel(followUp.due_at) ?? followUp.due_at,
        reminderStartDate: formatDateLabel(followUp.reminder_start_date),
        seasonalContext: followUp.seasonal_context?.trim() || null,
        suggestedAction:
          "Start warming up this account before the target season/date.",
      });
      continue;
    }

    if (isSeasonalFollowUpType(followUp.follow_up_type)) {
      continue;
    }

    const bucket = getFollowUpBucket(followUp.due_at);
    const item = buildFollowUpItem(
      followUp,
      companyById,
      contactNameByCompany,
      bucket === "overdue"
        ? "Follow up now — this item is past due."
        : "Complete today's scheduled follow-up.",
    );

    if (!item) continue;

    if (bucket === "overdue") overdueAll.push(item);
    else if (bucket === "today") todayAll.push(item);
  }

  const openOpportunitiesAll = opportunities
    .filter((opportunity) => workingCompanyIds.has(opportunity.company_id))
    .map((opportunity) => {
      const company = companyById.get(opportunity.company_id);
      const value = getOpportunityPipelineValue(opportunity);

      return {
        companyId: opportunity.company_id,
        companyName: company?.name ?? unwrapCompanyName(opportunity.companies),
        opportunityId: opportunity.id,
        name: opportunity.name?.trim() || "Load opportunity",
        status: opportunity.status,
        statusLabel: getOpportunityStageLabel(opportunity.status),
        value,
        valueLabel: value > 0 ? formatPipelineValue(value) : null,
        expectedCloseDate: formatDateLabel(opportunity.expected_close_date),
        nextStep: opportunity.next_step?.trim() || null,
        suggestedAction: "Advance this opportunity to the next stage.",
      } satisfies ReminderOpenOpportunityItem;
    });

  const openOpportunityCompanyIds = new Set(
    openOpportunitiesAll.map((opportunity) => opportunity.companyId),
  );
  const companiesWithPendingFollowUp = new Set(
    followUps
      .filter((followUp) => workingCompanyIds.has(followUp.company_id))
      .map((followUp) => followUp.company_id),
  );

  const priorityAccountsAll = companies
    .filter((company) => isWorkingCompany(company))
    .map((company) => {
      let score = 0;
      const reasons: string[] = [];

      if (isHighPriority(company.priority)) {
        score += company.priority === "Hot Lead" ? 50 : 30;
        reasons.push(`${company.priority} priority account`);
      }

      if (openOpportunityCompanyIds.has(company.id)) {
        score += 25;
        reasons.push("has open opportunity");
      }

      if (companiesWithPendingFollowUp.has(company.id)) {
        score += 20;
        reasons.push("has upcoming follow-up");
      }

      if (company.next_follow_up_at) {
        const nextFollowUp = new Date(company.next_follow_up_at);
        if (
          !Number.isNaN(nextFollowUp.getTime()) &&
          nextFollowUp <= addDays(todayEnd, 7)
        ) {
          score += 10;
          if (!reasons.includes("has upcoming follow-up")) {
            reasons.push("follow-up due soon");
          }
        }
      }

      return {
        company,
        score,
        reason:
          reasons.length > 0
            ? reasons.slice(0, 2).join("; ")
            : "Active working account",
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.company.name.localeCompare(b.company.name);
    })
    .map((entry) => ({
      companyId: entry.company.id,
      companyName: entry.company.name,
      priority: entry.company.priority,
      reason: entry.reason,
    }));

  const overdueFollowUps = overdueAll.slice(0, MAX_OVERDUE);
  const todayFollowUps = todayAll.slice(0, MAX_TODAY);
  const seasonalFollowUps = seasonalAll.slice(0, MAX_SEASONAL);
  const openOpportunities = openOpportunitiesAll.slice(0, MAX_OPEN_OPPORTUNITIES);
  const priorityAccounts = priorityAccountsAll.slice(0, MAX_PRIORITY_ACCOUNTS);

  const topPriorities = buildTopPriorities({
    overdueFollowUps,
    todayFollowUps,
    seasonalFollowUps,
    openOpportunities,
  });

  return {
    userId,
    brokerEmail,
    brokerName,
    topPriorities,
    overdueFollowUps,
    todayFollowUps,
    seasonalFollowUps,
    openOpportunities,
    priorityAccounts,
    hasMoreOverdue: overdueAll.length > MAX_OVERDUE,
    hasMoreToday: todayAll.length > MAX_TODAY,
    hasMoreSeasonal: seasonalAll.length > MAX_SEASONAL,
    hasMoreOpenOpportunities:
      openOpportunitiesAll.length > MAX_OPEN_OPPORTUNITIES,
    hasMorePriorityAccounts:
      priorityAccountsAll.length > MAX_PRIORITY_ACCOUNTS,
  };
}

export function getBrokerReminderCounts(
  data: BrokerReminderData,
): BrokerReminderCounts {
  return {
    topPriorities: data.topPriorities.length,
    overdueFollowUps: data.overdueFollowUps.length,
    todayFollowUps: data.todayFollowUps.length,
    seasonalFollowUps: data.seasonalFollowUps.length,
    openOpportunities: data.openOpportunities.length,
    priorityAccounts: data.priorityAccounts.length,
  };
}

export function buildRuleBasedSuggestedFocus(data: BrokerReminderData): string {
  if (
    data.overdueFollowUps.length > 0 ||
    data.seasonalFollowUps.length > 0 ||
    data.openOpportunities.length > 0
  ) {
    return "Start with overdue follow-ups, then warm up seasonal accounts, then advance open opportunities.";
  }

  if (data.todayFollowUps.length > 0) {
    return "Work through today's follow-ups, then review priority accounts and open opportunities.";
  }

  return "Use today to advance priority accounts, update notes, and prepare upcoming seasonal opportunities.";
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
      `Complete ${data.todayFollowUps.length} follow-up${data.todayFollowUps.length === 1 ? "" : "s"} due today.`,
    );
  }

  if (data.seasonalFollowUps.length > 0) {
    actions.push(
      `Warm up ${data.seasonalFollowUps.length} seasonal account${data.seasonalFollowUps.length === 1 ? "" : "s"} before the target date.`,
    );
  }

  if (data.openOpportunities.length > 0) {
    actions.push(
      `Advance ${data.openOpportunities.length} open opportunit${data.openOpportunities.length === 1 ? "y" : "ies"} to the next stage.`,
    );
  }

  if (data.priorityAccounts.length > 0) {
    actions.push(
      `Review ${data.priorityAccounts.length} priority working account${data.priorityAccounts.length === 1 ? "" : "s"}.`,
    );
  }

  if (actions.length === 0) {
    actions.push(
      "Pipeline looks quiet — use today to prospect, update notes, or prepare upcoming work.",
    );
  }

  return actions.slice(0, 5);
}

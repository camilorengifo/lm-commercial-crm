import {
  DEFAULT_LOAD_OPPORTUNITY_STATUS,
  DEFAULT_SALES_STAGE,
  LOAD_OPPORTUNITY_STATUSES,
  OPEN_OPPORTUNITY_STATUSES,
  SALES_STAGES_PROTECTED_FROM_QUOTE,
  isSalesStage,
  normalizeOpportunityStage,
  type LoadOpportunityStatus,
  type SalesStage,
} from "@/lib/crmConstants";
import { supabase } from "@/lib/supabaseClient";

export const LOAD_OPPORTUNITY_SELECT_FIELDS =
  "id, user_id, company_id, contact_id, name, lane_origin, lane_destination, equipment_type, commodity, frequency, estimated_loads, estimated_loads_per_week, target_rate, quoted_rate, estimated_revenue_usd, estimated_margin_usd, probability, expected_close_date, next_step, status, notes, created_at, updated_at";

export interface LoadOpportunity {
  id: string;
  user_id: string;
  company_id: string;
  contact_id: string | null;
  name: string;
  lane_origin: string | null;
  lane_destination: string | null;
  equipment_type: string | null;
  commodity: string | null;
  frequency: string | null;
  estimated_loads: string | null;
  estimated_loads_per_week: number | null;
  target_rate: number | null;
  quoted_rate: number | null;
  estimated_revenue_usd: number | null;
  estimated_margin_usd: number | null;
  probability: number;
  expected_close_date: string | null;
  next_step: string | null;
  status: LoadOpportunityStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoadOpportunityWithCompany extends LoadOpportunity {
  companyName: string;
  companySalesStage: SalesStage;
  contactFirstName: string | null;
  contactLastName: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  sales_stage: SalesStage;
  user_id: string;
}

export interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
}

export interface OpportunityFormState {
  name: string;
  contact_id: string;
  lane_origin: string;
  lane_destination: string;
  equipment_type: string;
  commodity: string;
  frequency: string;
  estimated_loads: string;
  estimated_loads_per_week: string;
  target_rate: string;
  quoted_rate: string;
  estimated_revenue_usd: string;
  estimated_margin_usd: string;
  probability: string;
  expected_close_date: string;
  next_step: string;
  status: LoadOpportunityStatus;
  notes: string;
}

export const EMPTY_OPPORTUNITY_FORM: OpportunityFormState = {
  name: "",
  contact_id: "",
  lane_origin: "",
  lane_destination: "",
  equipment_type: "",
  commodity: "",
  frequency: "",
  estimated_loads: "",
  estimated_loads_per_week: "",
  target_rate: "",
  quoted_rate: "",
  estimated_revenue_usd: "",
  estimated_margin_usd: "",
  probability: "25",
  expected_close_date: "",
  next_step: "",
  status: DEFAULT_LOAD_OPPORTUNITY_STATUS,
  notes: "",
};

export type LoadOpportunityCounts = Record<LoadOpportunityStatus, number>;

interface CompanyJoinRow {
  name: string;
  sales_stage: string;
}

interface ContactJoinRow {
  first_name: string;
  last_name: string | null;
}

interface LoadOpportunityQueryRow extends Omit<LoadOpportunity, "status"> {
  status: string;
  companies: CompanyJoinRow | CompanyJoinRow[] | null;
  contacts: ContactJoinRow | ContactJoinRow[] | null;
}

function unwrapJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapOpportunityRow(
  row: LoadOpportunityQueryRow,
): LoadOpportunityWithCompany {
  const company = unwrapJoin(row.companies);
  const contact = unwrapJoin(row.contacts);

  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    contact_id: row.contact_id,
    name: row.name,
    lane_origin: row.lane_origin,
    lane_destination: row.lane_destination,
    equipment_type: row.equipment_type,
    commodity: row.commodity,
    frequency: row.frequency,
    estimated_loads: row.estimated_loads,
    estimated_loads_per_week: row.estimated_loads_per_week,
    target_rate: row.target_rate,
    quoted_rate: row.quoted_rate,
    estimated_revenue_usd: row.estimated_revenue_usd,
    estimated_margin_usd: row.estimated_margin_usd,
    probability: row.probability ?? 25,
    expected_close_date: row.expected_close_date,
    next_step: row.next_step,
    status: normalizeOpportunityStage(row.status),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    companyName: company?.name ?? "Unknown company",
    companySalesStage: isSalesStage(company?.sales_stage ?? "")
      ? (company!.sales_stage as SalesStage)
      : DEFAULT_SALES_STAGE,
    contactFirstName: contact?.first_name ?? null,
    contactLastName: contact?.last_name ?? null,
  };
}

function mapOpportunityRecord(row: Record<string, unknown>): LoadOpportunity {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    company_id: row.company_id as string,
    contact_id: (row.contact_id as string | null) ?? null,
    name: (row.name as string) || "Load opportunity",
    lane_origin: (row.lane_origin as string | null) ?? null,
    lane_destination: (row.lane_destination as string | null) ?? null,
    equipment_type: (row.equipment_type as string | null) ?? null,
    commodity: (row.commodity as string | null) ?? null,
    frequency: (row.frequency as string | null) ?? null,
    estimated_loads: (row.estimated_loads as string | null) ?? null,
    estimated_loads_per_week:
      (row.estimated_loads_per_week as number | null) ?? null,
    target_rate: (row.target_rate as number | null) ?? null,
    quoted_rate: (row.quoted_rate as number | null) ?? null,
    estimated_revenue_usd: (row.estimated_revenue_usd as number | null) ?? null,
    estimated_margin_usd: (row.estimated_margin_usd as number | null) ?? null,
    probability: (row.probability as number | null) ?? 25,
    expected_close_date: (row.expected_close_date as string | null) ?? null,
    next_step: (row.next_step as string | null) ?? null,
    status: normalizeOpportunityStage(row.status as string),
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function formatContactName(
  contact: Pick<ContactOption, "first_name" | "last_name">,
): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

export function formatLane(
  origin: string | null,
  destination: string | null,
): string {
  const from = origin?.trim() || "—";
  const to = destination?.trim() || "—";
  return `${from} → ${to}`;
}

export function formatOpportunityRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseProbability(value: string): number {
  const parsed = parseOptionalInt(value);
  if (parsed === null) return 25;
  return Math.min(100, Math.max(0, parsed));
}

export function validateOpportunityForm(
  form: OpportunityFormState,
): string | null {
  if (!form.name.trim()) {
    return "Opportunity name is required.";
  }

  return null;
}

export function buildOpportunityPayload(form: OpportunityFormState) {
  return {
    name: form.name.trim(),
    contact_id: form.contact_id.trim() || null,
    lane_origin: form.lane_origin.trim() || null,
    lane_destination: form.lane_destination.trim() || null,
    equipment_type: form.equipment_type.trim() || null,
    commodity: form.commodity.trim() || null,
    status: form.status,
    notes: form.notes.trim() || null,
  };
}

export function opportunityToForm(
  opportunity: LoadOpportunity,
): OpportunityFormState {
  return {
    name: opportunity.name,
    contact_id: opportunity.contact_id ?? "",
    lane_origin: opportunity.lane_origin ?? "",
    lane_destination: opportunity.lane_destination ?? "",
    equipment_type: opportunity.equipment_type ?? "",
    commodity: opportunity.commodity ?? "",
    frequency: opportunity.frequency ?? "",
    estimated_loads: opportunity.estimated_loads ?? "",
    estimated_loads_per_week:
      opportunity.estimated_loads_per_week?.toString() ?? "",
    target_rate: opportunity.target_rate?.toString() ?? "",
    quoted_rate: opportunity.quoted_rate?.toString() ?? "",
    estimated_revenue_usd: opportunity.estimated_revenue_usd?.toString() ?? "",
    estimated_margin_usd: opportunity.estimated_margin_usd?.toString() ?? "",
    probability: opportunity.probability?.toString() ?? "25",
    expected_close_date: opportunity.expected_close_date ?? "",
    next_step: opportunity.next_step ?? "",
    status: normalizeOpportunityStage(opportunity.status),
    notes: opportunity.notes ?? "",
  };
}

export function buildOpportunitySummary(
  payload: ReturnType<typeof buildOpportunityPayload>,
): string {
  const lines = [
    `Name: ${payload.name}`,
    `Stage: ${payload.status}`,
    `Lane: ${formatLane(payload.lane_origin, payload.lane_destination)}`,
  ];

  if (payload.equipment_type) lines.push(`Equipment: ${payload.equipment_type}`);
  if (payload.commodity) lines.push(`Commodity: ${payload.commodity}`);
  if (payload.notes) lines.push(`Notes: ${payload.notes}`);

  return lines.join("\n");
}

export function sortOpportunitiesByRecent<
  T extends Pick<LoadOpportunity, "updated_at" | "created_at">,
>(opportunities: T[]): T[] {
  return [...opportunities].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime;
  });
}

export function truncateNotesPreview(
  notes: string | null,
  maxLength = 120,
): string | null {
  if (!notes?.trim()) return null;
  const trimmed = notes.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

export function isHighProbability(probability: number): boolean {
  return probability >= 70;
}

export interface OpportunityListMetrics {
  openCount: number;
  wonCount: number;
  lostCount: number;
  estimatedRevenue: number;
  estimatedMargin: number;
  highProbabilityCount: number;
}

export function buildOpportunityListMetrics(
  opportunities: LoadOpportunity[],
): OpportunityListMetrics {
  let openCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let estimatedRevenue = 0;
  let estimatedMargin = 0;
  let highProbabilityCount = 0;

  for (const opportunity of opportunities) {
    const stage = normalizeOpportunityStage(opportunity.status);

    if (stage === "won") {
      wonCount += 1;
      continue;
    }

    if (stage === "lost") {
      lostCount += 1;
      continue;
    }

    openCount += 1;

    if (opportunity.estimated_revenue_usd) {
      estimatedRevenue += opportunity.estimated_revenue_usd;
    }

    if (opportunity.estimated_margin_usd) {
      estimatedMargin += opportunity.estimated_margin_usd;
    }

    if (isHighProbability(opportunity.probability)) {
      highProbabilityCount += 1;
    }
  }

  return {
    openCount,
    wonCount,
    lostCount,
    estimatedRevenue,
    estimatedMargin,
    highProbabilityCount,
  };
}

export async function fetchCompaniesForOpportunities(
  userId: string,
  asAdmin: boolean,
) {
  let query = supabase
    .from("companies")
    .select("id, name, sales_stage, user_id")
    .order("name", { ascending: true });

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  return {
    data: ((data ?? []) as Array<{ id: string; name: string; sales_stage: string; user_id: string }>).map(
      (company) => ({
        id: company.id,
        name: company.name,
        sales_stage: isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE,
        user_id: company.user_id,
      }),
    ) as CompanyOption[],
    error,
  };
}

export async function fetchLoadOpportunitiesForCompany(
  userId: string,
  companyId: string,
  asAdmin = false,
) {
  let query = supabase
    .from("load_opportunities")
    .select(LOAD_OPPORTUNITY_SELECT_FIELDS)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(mapOpportunityRecord),
    error,
  };
}

export async function fetchLoadOpportunitiesWithCompanies(
  userId: string,
  asAdmin = false,
) {
  let query = supabase
    .from("load_opportunities")
    .select(
      `${LOAD_OPPORTUNITY_SELECT_FIELDS}, companies ( name, sales_stage ), contacts ( first_name, last_name )`,
    )
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [] as LoadOpportunityWithCompany[], error };
  }

  const rows = ((data ?? []) as LoadOpportunityQueryRow[]).map(mapOpportunityRow);
  return { data: sortOpportunitiesByRecent(rows), error: null };
}

export async function fetchLoadOpportunityById(
  opportunityId: string,
  userId: string,
  asAdmin = false,
) {
  let query = supabase
    .from("load_opportunities")
    .select(
      `${LOAD_OPPORTUNITY_SELECT_FIELDS}, companies ( name, sales_stage ), contacts ( first_name, last_name )`,
    )
    .eq("id", opportunityId);

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return { data: null, error };
  }

  return {
    data: mapOpportunityRow(data as LoadOpportunityQueryRow),
    error: null,
  };
}

export async function fetchContactsForCompany(
  userId: string,
  companyId: string,
  asAdmin = false,
) {
  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("company_id", companyId)
    .order("first_name", { ascending: true });

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  return { data: (data as ContactOption[]) ?? [], error };
}

export async function fetchLoadOpportunityCounts(
  userId: string,
  asAdmin = false,
): Promise<{ data: LoadOpportunityCounts; error: Error | null }> {
  let query = supabase.from("load_opportunities").select("status");

  if (!asAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    const emptyCounts = Object.fromEntries(
      LOAD_OPPORTUNITY_STATUSES.map((status) => [status, 0]),
    ) as LoadOpportunityCounts;

    return {
      data: emptyCounts,
      error,
    };
  }

  const counts = Object.fromEntries(
    LOAD_OPPORTUNITY_STATUSES.map((status) => [status, 0]),
  ) as LoadOpportunityCounts;

  for (const row of data ?? []) {
    const status = normalizeOpportunityStage(row.status as string);
    counts[status] += 1;
  }

  return { data: counts, error: null };
}

export function getSalesStageForOpportunityStatus(
  opportunityStatus: LoadOpportunityStatus | string,
  currentSalesStage: SalesStage,
): SalesStage | null {
  const stage = normalizeOpportunityStage(opportunityStatus);

  if (
    stage === "quoted" &&
    !SALES_STAGES_PROTECTED_FROM_QUOTE.includes(currentSalesStage)
  ) {
    return "Quoted";
  }

  if (stage === "won") {
    return "Customer";
  }

  return null;
}

export async function maybeUpdateCompanySalesStageFromOpportunity(
  userId: string,
  companyId: string,
  currentSalesStage: SalesStage,
  opportunityStatus: LoadOpportunityStatus | string,
) {
  const nextStage = getSalesStageForOpportunityStatus(
    opportunityStatus,
    currentSalesStage,
  );

  if (!nextStage || nextStage === currentSalesStage) {
    return { error: null, updated: false };
  }

  const { error } = await supabase
    .from("companies")
    .update({ sales_stage: nextStage })
    .eq("id", companyId)
    .eq("user_id", userId);

  return { error, updated: !error };
}

export async function createLoadOpportunity(input: {
  userId: string;
  companyId: string;
  form: OpportunityFormState;
  currentSalesStage: SalesStage;
  createTimelineActivity?: boolean;
}) {
  const validationError = validateOpportunityForm(input.form);
  if (validationError) {
    return { data: null, error: { message: validationError } };
  }

  const payload = buildOpportunityPayload(input.form);

  const { data, error } = await supabase
    .from("load_opportunities")
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      ...payload,
    })
    .select(LOAD_OPPORTUNITY_SELECT_FIELDS)
    .single();

  if (error) {
    return { data: null, error };
  }

  if (input.createTimelineActivity) {
    const activityError = await createLoadOpportunityTimelineActivity({
      userId: input.userId,
      companyId: input.companyId,
      payload,
    });

    if (activityError) {
      return { data: mapOpportunityRecord(data as Record<string, unknown>), error: activityError };
    }
  }

  const stageResult = await maybeUpdateCompanySalesStageFromOpportunity(
    input.userId,
    input.companyId,
    input.currentSalesStage,
    payload.status,
  );

  if (stageResult.error) {
    return {
      data: mapOpportunityRecord(data as Record<string, unknown>),
      error: stageResult.error,
    };
  }

  return {
    data: mapOpportunityRecord(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateLoadOpportunity(input: {
  userId: string;
  companyId: string;
  opportunityId: string;
  form: OpportunityFormState;
  currentSalesStage: SalesStage;
}) {
  const validationError = validateOpportunityForm(input.form);
  if (validationError) {
    return { data: null, error: { message: validationError } };
  }

  const payload = buildOpportunityPayload(input.form);

  const { data, error } = await supabase
    .from("load_opportunities")
    .update(payload)
    .eq("id", input.opportunityId)
    .eq("company_id", input.companyId)
    .eq("user_id", input.userId)
    .select(LOAD_OPPORTUNITY_SELECT_FIELDS)
    .single();

  if (error) {
    return { data: null, error };
  }

  const stageResult = await maybeUpdateCompanySalesStageFromOpportunity(
    input.userId,
    input.companyId,
    input.currentSalesStage,
    payload.status,
  );

  if (stageResult.error) {
    return {
      data: mapOpportunityRecord(data as Record<string, unknown>),
      error: stageResult.error,
    };
  }

  return {
    data: mapOpportunityRecord(data as Record<string, unknown>),
    error: null,
  };
}

export async function deleteLoadOpportunity(
  userId: string,
  companyId: string,
  opportunityId: string,
) {
  return supabase
    .from("load_opportunities")
    .delete()
    .eq("id", opportunityId)
    .eq("company_id", companyId)
    .eq("user_id", userId);
}

async function createLoadOpportunityTimelineActivity(input: {
  userId: string;
  companyId: string;
  payload: ReturnType<typeof buildOpportunityPayload>;
}) {
  const { error } = await supabase.from("activities").insert({
    user_id: input.userId,
    company_id: input.companyId,
    activity_type: "note",
    subject: "Load opportunity created",
    notes: buildOpportunitySummary(input.payload),
    activity_at: new Date().toISOString(),
  });

  return error;
}

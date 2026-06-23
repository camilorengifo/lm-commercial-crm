import {
  DEFAULT_LOAD_OPPORTUNITY_STATUS,
  DEFAULT_SALES_STAGE,
  SALES_STAGES_PROTECTED_FROM_QUOTE,
  isSalesStage,
  type LoadOpportunityStatus,
  type SalesStage,
} from "@/lib/crmConstants";
import { supabase } from "@/lib/supabaseClient";

export const LOAD_OPPORTUNITY_SELECT_FIELDS =
  "id, user_id, company_id, contact_id, lane_origin, lane_destination, equipment_type, commodity, frequency, estimated_loads_per_week, target_rate, quoted_rate, status, notes, created_at, updated_at";

export interface LoadOpportunity {
  id: string;
  user_id: string;
  company_id: string;
  contact_id: string | null;
  lane_origin: string | null;
  lane_destination: string | null;
  equipment_type: string | null;
  commodity: string | null;
  frequency: string | null;
  estimated_loads_per_week: number | null;
  target_rate: number | null;
  quoted_rate: number | null;
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

export interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
}

export interface OpportunityFormState {
  contact_id: string;
  lane_origin: string;
  lane_destination: string;
  equipment_type: string;
  commodity: string;
  frequency: string;
  estimated_loads_per_week: string;
  target_rate: string;
  quoted_rate: string;
  status: LoadOpportunityStatus;
  notes: string;
}

export const EMPTY_OPPORTUNITY_FORM: OpportunityFormState = {
  contact_id: "",
  lane_origin: "",
  lane_destination: "",
  equipment_type: "",
  commodity: "",
  frequency: "",
  estimated_loads_per_week: "",
  target_rate: "",
  quoted_rate: "",
  status: DEFAULT_LOAD_OPPORTUNITY_STATUS,
  notes: "",
};

export type LoadOpportunityCounts = Record<
  "New" | "Quoted" | "Won" | "Lost",
  number
>;

interface CompanyJoinRow {
  name: string;
  sales_stage: string;
}

interface ContactJoinRow {
  first_name: string;
  last_name: string | null;
}

interface LoadOpportunityQueryRow extends LoadOpportunity {
  companies: CompanyJoinRow | CompanyJoinRow[] | null;
  contacts: ContactJoinRow | ContactJoinRow[] | null;
}

function unwrapJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
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

export function validateOpportunityForm(
  form: OpportunityFormState,
): string | null {
  if (
    !form.lane_origin.trim() &&
    !form.lane_destination.trim() &&
    !form.commodity.trim() &&
    !form.notes.trim()
  ) {
    return "Enter a lane, commodity, or notes to describe this opportunity.";
  }

  return null;
}

export function buildOpportunityPayload(form: OpportunityFormState) {
  return {
    contact_id: form.contact_id.trim() || null,
    lane_origin: form.lane_origin.trim() || null,
    lane_destination: form.lane_destination.trim() || null,
    equipment_type: form.equipment_type.trim() || null,
    commodity: form.commodity.trim() || null,
    frequency: form.frequency.trim() || null,
    estimated_loads_per_week: parseOptionalInt(form.estimated_loads_per_week),
    target_rate: parseOptionalNumber(form.target_rate),
    quoted_rate: parseOptionalNumber(form.quoted_rate),
    status: form.status,
    notes: form.notes.trim() || null,
  };
}

export function opportunityToForm(
  opportunity: LoadOpportunity,
): OpportunityFormState {
  return {
    contact_id: opportunity.contact_id ?? "",
    lane_origin: opportunity.lane_origin ?? "",
    lane_destination: opportunity.lane_destination ?? "",
    equipment_type: opportunity.equipment_type ?? "",
    commodity: opportunity.commodity ?? "",
    frequency: opportunity.frequency ?? "",
    estimated_loads_per_week:
      opportunity.estimated_loads_per_week?.toString() ?? "",
    target_rate: opportunity.target_rate?.toString() ?? "",
    quoted_rate: opportunity.quoted_rate?.toString() ?? "",
    status: opportunity.status,
    notes: opportunity.notes ?? "",
  };
}

export function buildOpportunitySummary(
  payload: ReturnType<typeof buildOpportunityPayload>,
): string {
  const lines = [
    `Status: ${payload.status}`,
    `Lane: ${formatLane(payload.lane_origin, payload.lane_destination)}`,
  ];

  if (payload.equipment_type) lines.push(`Equipment: ${payload.equipment_type}`);
  if (payload.commodity) lines.push(`Commodity: ${payload.commodity}`);
  if (payload.frequency) lines.push(`Frequency: ${payload.frequency}`);
  if (payload.estimated_loads_per_week !== null) {
    lines.push(`Est. loads/week: ${payload.estimated_loads_per_week}`);
  }
  if (payload.target_rate !== null) {
    lines.push(`Target rate: ${formatOpportunityRate(payload.target_rate)}`);
  }
  if (payload.quoted_rate !== null) {
    lines.push(`Quoted rate: ${formatOpportunityRate(payload.quoted_rate)}`);
  }
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

function mapOpportunityRow(row: LoadOpportunityQueryRow): LoadOpportunityWithCompany {
  const company = unwrapJoin(row.companies);
  const contact = unwrapJoin(row.contacts);

  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    contact_id: row.contact_id,
    lane_origin: row.lane_origin,
    lane_destination: row.lane_destination,
    equipment_type: row.equipment_type,
    commodity: row.commodity,
    frequency: row.frequency,
    estimated_loads_per_week: row.estimated_loads_per_week,
    target_rate: row.target_rate,
    quoted_rate: row.quoted_rate,
    status: row.status,
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

export async function fetchLoadOpportunitiesForCompany(
  userId: string,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("load_opportunities")
    .select(LOAD_OPPORTUNITY_SELECT_FIELDS)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data: (data as LoadOpportunity[]) ?? [], error };
}

export async function fetchLoadOpportunitiesWithCompanies(userId: string) {
  const { data, error } = await supabase
    .from("load_opportunities")
    .select(
      `${LOAD_OPPORTUNITY_SELECT_FIELDS}, companies ( name, sales_stage ), contacts ( first_name, last_name )`,
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [] as LoadOpportunityWithCompany[], error };
  }

  const rows = ((data ?? []) as LoadOpportunityQueryRow[]).map(mapOpportunityRow);
  return { data: sortOpportunitiesByRecent(rows), error: null };
}

export async function fetchContactsForCompany(
  userId: string,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .order("first_name", { ascending: true });

  return { data: (data as ContactOption[]) ?? [], error };
}

export async function fetchLoadOpportunityCounts(
  userId: string,
): Promise<{ data: LoadOpportunityCounts; error: Error | null }> {
  const { data, error } = await supabase
    .from("load_opportunities")
    .select("status")
    .eq("user_id", userId);

  if (error) {
    return {
      data: { New: 0, Quoted: 0, Won: 0, Lost: 0 },
      error,
    };
  }

  const counts: LoadOpportunityCounts = {
    New: 0,
    Quoted: 0,
    Won: 0,
    Lost: 0,
  };

  for (const row of data ?? []) {
    const status = row.status as LoadOpportunityStatus;
    if (status in counts) {
      counts[status as keyof LoadOpportunityCounts] += 1;
    }
  }

  return { data: counts, error: null };
}

export function getSalesStageForOpportunityStatus(
  opportunityStatus: LoadOpportunityStatus,
  currentSalesStage: SalesStage,
): SalesStage | null {
  if (
    opportunityStatus === "Quoted" &&
    !SALES_STAGES_PROTECTED_FROM_QUOTE.includes(currentSalesStage)
  ) {
    return "Quoted";
  }

  if (opportunityStatus === "Won") {
    return "Customer";
  }

  return null;
}

export async function maybeUpdateCompanySalesStageFromOpportunity(
  userId: string,
  companyId: string,
  currentSalesStage: SalesStage,
  opportunityStatus: LoadOpportunityStatus,
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
      return { data: data as LoadOpportunity, error: activityError };
    }
  }

  const stageResult = await maybeUpdateCompanySalesStageFromOpportunity(
    input.userId,
    input.companyId,
    input.currentSalesStage,
    payload.status,
  );

  if (stageResult.error) {
    return { data: data as LoadOpportunity, error: stageResult.error };
  }

  return { data: data as LoadOpportunity, error: null };
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
    return { data: data as LoadOpportunity, error: stageResult.error };
  }

  return { data: data as LoadOpportunity, error: null };
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

export function truncateNotesPreview(
  notes: string | null,
  maxLength = 120,
): string | null {
  if (!notes?.trim()) return null;
  const trimmed = notes.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

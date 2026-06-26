export const SALES_STAGES = [
  "New Lead",
  "Contacted",
  "In Follow-up",
  "Quoted",
  "Customer",
  "Not Interested",
  "Dormant",
] as const;

export type SalesStage = (typeof SALES_STAGES)[number];

export const DEFAULT_SALES_STAGE: SalesStage = "New Lead";

export const COMPANY_PRIORITIES = [
  "Low",
  "Medium",
  "High",
  "Hot Lead",
] as const;

export type CompanyPriority = (typeof COMPANY_PRIORITIES)[number];

export const COUNTRY_OPTIONS = [
  "United States",
  "Mexico",
  "Canada",
] as const;

export const ACTIVITY_TYPES = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "visit", label: "Visit" },
  { value: "note", label: "Note" },
  { value: "other", label: "Other" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> =
  Object.fromEntries(
    ACTIVITY_TYPES.map((option) => [option.value, option.label]),
  ) as Record<ActivityType, string>;

export type FollowUpStatus = "pending" | "completed" | "cancelled";

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const LOAD_OPPORTUNITY_STATUSES = [
  "prospecting",
  "contacted",
  "quoted",
  "negotiating",
  "won",
  "lost",
] as const;

export type LoadOpportunityStatus = (typeof LOAD_OPPORTUNITY_STATUSES)[number];

export const DEFAULT_LOAD_OPPORTUNITY_STATUS: LoadOpportunityStatus = "prospecting";

export const OPEN_OPPORTUNITY_STATUSES: LoadOpportunityStatus[] = [
  "prospecting",
  "contacted",
  "quoted",
  "negotiating",
];

export const OPPORTUNITY_STAGE_LABELS: Record<LoadOpportunityStatus, string> = {
  prospecting: "Prospecting",
  contacted: "Contacted",
  quoted: "Quoted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

const LEGACY_OPPORTUNITY_STATUS_MAP: Record<string, LoadOpportunityStatus> = {
  New: "prospecting",
  Quoted: "quoted",
  "On Hold": "negotiating",
  Won: "won",
  Lost: "lost",
};

export function normalizeOpportunityStage(value: string): LoadOpportunityStatus {
  if (isLoadOpportunityStatus(value)) {
    return value;
  }

  return LEGACY_OPPORTUNITY_STATUS_MAP[value] ?? DEFAULT_LOAD_OPPORTUNITY_STATUS;
}

export function isOpenOpportunityStage(status: string): boolean {
  const stage = normalizeOpportunityStage(status);
  return stage !== "won" && stage !== "lost";
}

export function getOpportunityStageLabel(status: string): string {
  return OPPORTUNITY_STAGE_LABELS[normalizeOpportunityStage(status)];
}

export const SALES_STAGES_PROTECTED_FROM_QUOTE: SalesStage[] = [
  "Customer",
  "Not Interested",
  "Dormant",
];

export function isLoadOpportunityStatus(
  value: string,
): value is LoadOpportunityStatus {
  return (LOAD_OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}

export function loadOpportunityStatusBadgeClass(
  status: LoadOpportunityStatus | string,
): string {
  switch (normalizeOpportunityStage(status)) {
    case "prospecting":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    case "contacted":
      return "bg-violet-50 text-violet-800 ring-violet-200";
    case "quoted":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "negotiating":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "won":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "lost":
      return "bg-red-50 text-red-800 ring-red-200";
  }
}

export function isSalesStage(value: string): value is SalesStage {
  return (SALES_STAGES as readonly string[]).includes(value);
}

export function salesStageBadgeClass(stage: SalesStage): string {
  switch (stage) {
    case "New Lead":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    case "Contacted":
      return "bg-violet-50 text-violet-800 ring-violet-200";
    case "In Follow-up":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "Quoted":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "Customer":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "Not Interested":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    case "Dormant":
      return "bg-stone-100 text-stone-600 ring-stone-200";
  }
}

export function priorityBadgeClass(priority: CompanyPriority): string {
  switch (priority) {
    case "Hot Lead":
      return "bg-red-50 text-red-800 ring-red-200";
    case "High":
      return "bg-orange-50 text-orange-800 ring-orange-200";
    case "Medium":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "Low":
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

export function activityTypeBadgeClass(type: ActivityType): string {
  switch (type) {
    case "call":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "email":
      return "bg-violet-50 text-violet-800 ring-violet-200";
    case "meeting":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "visit":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "note":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "other":
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

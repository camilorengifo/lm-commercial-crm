export const ACCOUNT_STATUSES = ["active", "paused", "archived"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const ACCOUNT_STATUS_FILTER_OPTIONS = [
  { value: "working", label: "Working accounts" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

export type AccountStatusFilter =
  (typeof ACCOUNT_STATUS_FILTER_OPTIONS)[number]["value"];

export const ACCOUNT_DISPOSITIONS = [
  { value: "working", label: "Working" },
  { value: "no_response", label: "No response" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "no_current_freight", label: "No current freight" },
  { value: "wrong_contact", label: "Wrong contact" },
  { value: "already_covered", label: "Already covered" },
  { value: "future_opportunity", label: "Future opportunity" },
  { value: "call_back_later", label: "Call back later" },
  { value: "do_not_pursue", label: "Do not pursue" },
  { value: "other", label: "Other" },
] as const;

export const BULK_ARCHIVE_DISPOSITIONS = ACCOUNT_DISPOSITIONS.filter(
  (option) => option.value !== "working",
);

export const BULK_PAUSE_DISPOSITIONS = [
  { value: "future_opportunity", label: "Future opportunity" },
  { value: "no_current_freight", label: "No current freight" },
  { value: "call_back_later", label: "Call back later" },
  { value: "other", label: "Other" },
] as const;

export type BulkPauseDisposition =
  (typeof BULK_PAUSE_DISPOSITIONS)[number]["value"];

export type AccountDisposition = (typeof ACCOUNT_DISPOSITIONS)[number]["value"];

const DISPOSITION_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_DISPOSITIONS.map((option) => [option.value, option.label]),
);

export function normalizeAccountStatus(
  value: string | null | undefined,
): AccountStatus {
  if (value === "paused" || value === "archived") return value;
  return "active";
}

export function matchesAccountStatusFilter(
  status: AccountStatus,
  filter: AccountStatusFilter,
): boolean {
  switch (filter) {
    case "working":
      return status === "active" || status === "paused";
    case "active":
      return status === "active";
    case "paused":
      return status === "paused";
    case "archived":
      return status === "archived";
    case "all":
      return true;
  }
}

export function getAccountDispositionLabel(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  return DISPOSITION_LABELS[value] ?? value.replace(/_/g, " ");
}

export function accountStatusBadgeClass(status: AccountStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "paused":
      return "bg-amber-100 text-amber-800";
    case "archived":
      return "bg-zinc-200 text-zinc-700";
  }
}

export function accountDispositionBadgeClass(_disposition: string): string {
  return "bg-slate-100 text-slate-700";
}

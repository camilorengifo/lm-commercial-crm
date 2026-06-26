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

/** Dispositions shown on company detail (excludes Working). */
export const DETAIL_ACCOUNT_DISPOSITIONS = BULK_ARCHIVE_DISPOSITIONS;

export interface CompanyAccountStatusFields {
  account_status: AccountStatus;
  account_disposition: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_notes: string | null;
}

export function buildAccountStatusSavePayload(input: {
  accountStatus: AccountStatus;
  disposition: string;
  archiveReason: string;
  archiveNotes: string;
}): {
  accountDisposition: string | null;
  archiveReason: string | null;
  archiveNotes: string | null;
} {
  const disposition = input.disposition.trim() || null;
  const notes = input.archiveNotes.trim() || null;
  const freeTextReason = input.archiveReason.trim() || null;

  if (input.accountStatus === "archived") {
    const reason = disposition ?? freeTextReason;
    return {
      accountDisposition: disposition,
      archiveReason: reason,
      archiveNotes: notes,
    };
  }

  if (input.accountStatus === "paused") {
    return {
      accountDisposition: disposition,
      archiveReason: null,
      archiveNotes: notes,
    };
  }

  return {
    accountDisposition: disposition,
    archiveReason: null,
    archiveNotes: null,
  };
}

export function normalizeCompanyAccountStatusFields(
  row: {
    account_status?: string | null;
    account_disposition?: string | null;
    archived_at?: string | null;
    archived_by?: string | null;
    archive_reason?: string | null;
    archive_notes?: string | null;
  },
): CompanyAccountStatusFields {
  return {
    account_status: normalizeAccountStatus(row.account_status),
    account_disposition: row.account_disposition?.trim() || null,
    archived_at: row.archived_at ?? null,
    archived_by: row.archived_by ?? null,
    archive_reason: row.archive_reason?.trim() || null,
    archive_notes: row.archive_notes?.trim() || null,
  };
}

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

/** Active and paused accounts belong on the working list; archived accounts do not. */
export function isWorkingAccountStatus(
  value: string | null | undefined,
): boolean {
  return normalizeAccountStatus(value) !== "archived";
}

export function isWorkingCompanyRecord(input: {
  account_status?: string | null;
  deleted_at?: string | null;
}): boolean {
  if (input.deleted_at) return false;
  return isWorkingAccountStatus(input.account_status);
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

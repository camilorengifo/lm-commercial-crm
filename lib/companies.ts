import type { AccountDisposition, AccountStatus } from "@/lib/accountStatus";
import type { CompanyPriority } from "@/lib/crmConstants";

export interface CompanyRecord {
  id: string;
  user_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: string;
  general_notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  account_status?: AccountStatus | string | null;
  account_disposition?: AccountDisposition | string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_notes?: string | null;
}

export type CompanySortOption =
  | "name_asc"
  | "name_desc"
  | "created_newest"
  | "created_oldest"
  | "priority"
  | "last_contact_newest"
  | "last_contact_oldest"
  | "next_follow_up_soonest"
  | "next_follow_up_latest";

export const COMPANY_SORT_OPTIONS: Array<{
  value: CompanySortOption;
  label: string;
}> = [
  { value: "name_asc", label: "Company name A–Z" },
  { value: "name_desc", label: "Company name Z–A" },
  { value: "created_newest", label: "Created date (newest)" },
  { value: "created_oldest", label: "Created date (oldest)" },
  { value: "priority", label: "Priority" },
  { value: "last_contact_newest", label: "Last contact (newest)" },
  { value: "last_contact_oldest", label: "Last contact (oldest)" },
  { value: "next_follow_up_soonest", label: "Next follow-up (soonest)" },
  { value: "next_follow_up_latest", label: "Next follow-up (latest)" },
];

const PRIORITY_ORDER: Record<string, number> = {
  "Hot Lead": 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function compareNullableDates(
  a: string | null,
  b: string | null,
  direction: "asc" | "desc",
): number {
  const aTime = a ? new Date(a).getTime() : direction === "asc" ? Infinity : -Infinity;
  const bTime = b ? new Date(b).getTime() : direction === "asc" ? Infinity : -Infinity;
  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

export function sortCompanies<T extends CompanyRecord>(
  companies: T[],
  sort: CompanySortOption,
): T[] {
  const sorted = [...companies];

  sorted.sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "created_newest":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "created_oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "priority": {
        const aRank = PRIORITY_ORDER[a.priority] ?? 99;
        const bRank = PRIORITY_ORDER[b.priority] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return a.name.localeCompare(b.name);
      }
      case "last_contact_newest":
        return compareNullableDates(a.last_contact_at, b.last_contact_at, "desc");
      case "last_contact_oldest":
        return compareNullableDates(a.last_contact_at, b.last_contact_at, "asc");
      case "next_follow_up_soonest":
        return compareNullableDates(a.next_follow_up_at, b.next_follow_up_at, "asc");
      case "next_follow_up_latest":
        return compareNullableDates(a.next_follow_up_at, b.next_follow_up_at, "desc");
    }
  });

  return sorted;
}

export function filterCompaniesBySearch<T extends CompanyRecord>(
  companies: T[],
  search: string,
): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return companies;

  return companies.filter((company) => {
    const haystack = [
      company.name,
      company.city,
      company.state,
      company.country,
      company.priority,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export const COMPANY_LIST_SELECT =
  "id, user_id, name, city, state, country, priority, sales_stage, general_notes, last_contact_at, next_follow_up_at, created_at, deleted_at, deleted_by, delete_reason, account_status, account_disposition, archived_at, archived_by, archive_reason, archive_notes";

export function toDatetimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

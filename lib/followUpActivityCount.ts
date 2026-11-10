import type { ActivityType } from "@/lib/crmConstants";

/**
 * Activity types that record a commercial follow-up that already happened.
 *
 * Counted:
 * - call, email, meeting, visit: broker-logged completed channels
 * - note, other: broker-logged follow-up notes, except system status subjects
 * - follow_up_no_response, follow_up_rescheduled_contact: one outcome row per
 *   completed follow-up
 *
 * Not counted:
 * - pending follow_ups rows (scheduled work that has not been performed)
 * - do_not_follow_up and outreach_suppression (disposition / status changes)
 * - system timeline notes listed in STATUS_CHANGE_ACTIVITY_SUBJECTS
 * - activity_edit_audits (edits update the original activity)
 */
export const COUNTABLE_FOLLOW_UP_ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "visit",
  "note",
  "other",
  "follow_up_no_response",
  "follow_up_rescheduled_contact",
] as const satisfies readonly ActivityType[];

const COUNTABLE_FOLLOW_UP_ACTIVITY_TYPE_SET = new Set<string>(
  COUNTABLE_FOLLOW_UP_ACTIVITY_TYPES,
);

/** Outcome rows are unique per completed follow-up. Retries must not add another count. */
const FOLLOW_UP_OUTCOME_ACTIVITY_TYPES = new Set<string>([
  "follow_up_no_response",
  "follow_up_rescheduled_contact",
]);

/**
 * Subjects written by account, ownership, import, and draft workflows.
 * They share activity_type "note" with real follow-up notes, so the subject
 * is what keeps status changes out of the company counter.
 */
export const STATUS_CHANGE_ACTIVITY_SUBJECTS = [
  "Company archived",
  "Company restored",
  "Company details updated",
  "Company ownership reassigned",
  "Bulk company update",
  "Account restored",
  "Account archived",
  "Account paused",
  "Account status changed",
  "Account status updated",
  "Load opportunity created",
  "AI outreach draft generated",
] as const;

const STATUS_CHANGE_ACTIVITY_SUBJECT_SET = new Set<string>(
  STATUS_CHANGE_ACTIVITY_SUBJECTS,
);

export const FOLLOW_UP_TIMELINE_FILTER = "follow-ups";

const COMPANY_ID_CHUNK_SIZE = 80;
const ACTIVITY_PAGE_SIZE = 1000;

const ACTIVITY_COUNT_FIELDS =
  "id, company_id, activity_type, subject, follow_up_id";
const ACTIVITY_COUNT_FIELDS_WITHOUT_FOLLOW_UP_LINK =
  "id, company_id, activity_type, subject";

export interface FollowUpActivityCountRow {
  id: string;
  company_id: string;
  activity_type: string;
  subject?: string | null;
  follow_up_id?: string | null;
}

export function companyFollowUpTimelinePath(companyId: string): string {
  const params = new URLSearchParams({
    tab: "timeline",
    timeline: FOLLOW_UP_TIMELINE_FILTER,
  });
  return `/companies/${companyId}?${params.toString()}`;
}

export function isFollowUpTimelineFilter(
  value: string | null | undefined,
): boolean {
  return value === FOLLOW_UP_TIMELINE_FILTER;
}

export function isStatusChangeActivity(row: {
  activity_type: string;
  subject?: string | null;
}): boolean {
  if (
    row.activity_type === "do_not_follow_up" ||
    row.activity_type === "outreach_suppression"
  ) {
    return true;
  }

  if (row.activity_type !== "note" && row.activity_type !== "other") {
    return false;
  }

  const subject = row.subject?.trim();
  return Boolean(subject && STATUS_CHANGE_ACTIVITY_SUBJECT_SET.has(subject));
}

/** True when this timeline row is a performed commercial follow-up. */
export function isCompletedFollowUpActivity(
  row: FollowUpActivityCountRow,
): boolean {
  if (!COUNTABLE_FOLLOW_UP_ACTIVITY_TYPE_SET.has(row.activity_type)) {
    return false;
  }

  return !isStatusChangeActivity(row);
}

function followUpActivityDedupeKey(row: FollowUpActivityCountRow): string {
  if (
    row.follow_up_id &&
    FOLLOW_UP_OUTCOME_ACTIVITY_TYPES.has(row.activity_type)
  ) {
    return `outcome:${row.company_id}:${row.follow_up_id}:${row.activity_type}`;
  }

  return `activity:${row.id}`;
}

/**
 * Company-level counts. Contact is ignored. Duplicate outcome rows for the
 * same follow-up, and repeated reads of the same activity id, count once.
 */
export function countFollowUpActivitiesByCompany(
  rows: FollowUpActivityCountRow[],
): Record<string, number> {
  const seenByCompany = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.company_id || !isCompletedFollowUpActivity(row)) continue;

    const seen = seenByCompany.get(row.company_id) ?? new Set<string>();
    seen.add(followUpActivityDedupeKey(row));
    seenByCompany.set(row.company_id, seen);
  }

  const counts: Record<string, number> = {};
  for (const [companyId, seen] of seenByCompany) {
    counts[companyId] = seen.size;
  }
  return counts;
}

export function followUpCountBadgeClass(count: number): string {
  if (count >= 13) return "bg-red-50 text-red-800 ring-red-200";
  if (count >= 10) return "bg-orange-50 text-orange-800 ring-orange-200";
  if (count >= 6) return "bg-yellow-50 text-yellow-900 ring-yellow-200";
  if (count >= 1) return "bg-blue-50 text-blue-800 ring-blue-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function followUpCountLabel(count: number): string {
  const noun = count === 1 ? "Follow-up" : "Follow-ups";
  return `↻ ${count} ${noun}`;
}

function isMissingFollowUpLinkColumn(error: { message?: string }): boolean {
  return (error.message ?? "").toLowerCase().includes("follow_up_id");
}

async function fetchActivityCountPage(input: {
  companyIds: string[];
  from: number;
  includeFollowUpLink: boolean;
}): Promise<{
  data: FollowUpActivityCountRow[];
  error: { message?: string; code?: string } | null;
}> {
  const { supabase } = await import("@/lib/supabaseClient");

  if (input.includeFollowUpLink) {
    const { data, error } = await supabase
      .from("activities")
      .select(ACTIVITY_COUNT_FIELDS)
      .in("company_id", input.companyIds)
      .in("activity_type", [...COUNTABLE_FOLLOW_UP_ACTIVITY_TYPES])
      .order("id", { ascending: true })
      .range(input.from, input.from + ACTIVITY_PAGE_SIZE - 1);

    if (error) {
      return { data: [], error };
    }

    return {
      data: (data ?? []).map((row) => ({
        id: row.id,
        company_id: row.company_id,
        activity_type: row.activity_type,
        subject: row.subject,
        follow_up_id: row.follow_up_id,
      })),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_COUNT_FIELDS_WITHOUT_FOLLOW_UP_LINK)
    .in("company_id", input.companyIds)
    .in("activity_type", [...COUNTABLE_FOLLOW_UP_ACTIVITY_TYPES])
    .order("id", { ascending: true })
    .range(input.from, input.from + ACTIVITY_PAGE_SIZE - 1);

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      company_id: row.company_id,
      activity_type: row.activity_type,
      subject: row.subject,
      follow_up_id: null,
    })),
    error: null,
  };
}

/**
 * One batched read for every company on the Follow-ups page.
 * Counts come from activities, so completing, deleting, or editing history
 * stays aligned with the Commercial Timeline.
 */
export async function fetchFollowUpActivityCounts(
  companyIds: string[],
): Promise<{
  counts: Record<string, number>;
  error: { message?: string } | null;
}> {
  const uniqueIds = [...new Set(companyIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { counts: {}, error: null };
  }

  const rows: FollowUpActivityCountRow[] = [];
  let includeFollowUpLink = true;

  for (
    let index = 0;
    index < uniqueIds.length;
    index += COMPANY_ID_CHUNK_SIZE
  ) {
    const chunk = uniqueIds.slice(index, index + COMPANY_ID_CHUNK_SIZE);
    let from = 0;

    while (true) {
      const page = await fetchActivityCountPage({
        companyIds: chunk,
        from,
        includeFollowUpLink,
      });

      if (page.error && includeFollowUpLink && isMissingFollowUpLinkColumn(page.error)) {
        includeFollowUpLink = false;
        continue;
      }

      if (page.error) {
        return { counts: {}, error: page.error };
      }

      rows.push(...page.data);
      if (page.data.length < ACTIVITY_PAGE_SIZE) break;
      from += ACTIVITY_PAGE_SIZE;
    }
  }

  return { counts: countFollowUpActivitiesByCompany(rows), error: null };
}

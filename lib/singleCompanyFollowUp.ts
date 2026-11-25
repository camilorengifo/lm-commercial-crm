/**
 * One open follow-up per company.
 * The contact on an activity records who was managed. It does not start
 * a separate follow-up sequence.
 */

import { businessCalendarDate } from "./followUpClassification";

export interface PendingFollowUpCandidate {
  id: string;
  companyId: string;
  dueAt: string;
  createdAt: string;
}

export interface SinglePendingPlan {
  keepId: string | null;
  dueAt: string | null;
  cancelIds: string[];
}

function instant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sameFollowUpInstant(left: string, right: string): boolean {
  const leftInstant = instant(left);
  const rightInstant = instant(right);
  return leftInstant !== null && leftInstant === rightInstant;
}

function newestPending(
  rows: PendingFollowUpCandidate[],
): PendingFollowUpCandidate {
  return [...rows].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) return created;
    return right.id.localeCompare(left.id);
  })[0];
}

/**
 * Choose the one pending row that stays open.
 * A date chosen for this action wins. Otherwise the latest activity that
 * already named a next date wins. Rows that are not kept leave the queue.
 */
export function planSinglePendingFollowUp(input: {
  pending: PendingFollowUpCandidate[];
  /** Due date selected by the current save. */
  requestedDueAt?: string | null;
  /** Latest activity scheduled_follow_up_at for this company. */
  explicitDueAt?: string | null;
  /** Row that must stay, such as the successor of a retry. */
  preferId?: string | null;
}): SinglePendingPlan {
  const pending = input.pending;
  if (pending.length === 0) {
    return { keepId: null, dueAt: null, cancelIds: [] };
  }

  const requestedDueAt = input.requestedDueAt?.trim() || null;
  const explicitDueAt = input.explicitDueAt?.trim() || null;
  const preferId = input.preferId?.trim() || null;

  let keep = preferId
    ? pending.find((row) => row.id === preferId)
    : undefined;

  const targetDue = requestedDueAt ?? explicitDueAt;
  if (!keep && targetDue) {
    const matches = pending.filter((row) =>
      sameFollowUpInstant(row.dueAt, targetDue),
    );
    if (matches.length > 0) {
      keep = newestPending(matches);
    }
  }

  if (!keep) {
    keep = newestPending(pending);
  }

  const dueAt = requestedDueAt
    ? requestedDueAt
    : preferId && keep.id === preferId
      ? keep.dueAt
      : explicitDueAt ?? keep.dueAt;

  return {
    keepId: keep.id,
    dueAt,
    cancelIds: pending
      .filter((row) => row.id !== keep.id)
      .map((row) => row.id),
  };
}

const COMPLETION_SUCCESSOR_SKEW_MS = 2000;
const SCHEDULE_MATCH_MS = 60_000;

export interface CompanyCycleFollowUp {
  id: string;
  companyId: string;
  dueAt: string;
  createdAt: string;
  sourceFollowUpId: string | null;
}

export interface CompanyFollowUpCompletionPlan {
  ok: boolean;
  error: string | null;
  completeTarget: boolean;
  cancelIds: string[];
  createSuccessor: boolean;
  keepSuccessorId: string | null;
  dueAt: string;
  recordActivity: boolean;
}

function parsedInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function schedulesMatch(left: string, right: string): boolean {
  if (sameFollowUpInstant(left, right)) return true;
  const leftInstant = parsedInstant(left);
  const rightInstant = parsedInstant(right);
  return (
    leftInstant !== null &&
    rightInstant !== null &&
    Math.abs(leftInstant - rightInstant) < SCHEDULE_MATCH_MS
  );
}

/**
 * A pending row created by this completion, not an older duplicate that
 * merely points at the follow-up being closed.
 */
function isSettledCompletionSuccessor(
  row: CompanyCycleFollowUp,
  input: {
    companyId: string;
    targetId: string;
    targetStatus: string;
    targetCompletedAt: string | null;
    requestedDueAt: string;
    activityScheduledDueAt: string | null;
  },
): boolean {
  if (row.companyId !== input.companyId || row.id === input.targetId) return false;
  if (row.sourceFollowUpId !== input.targetId) return false;
  if (input.targetStatus !== "completed" || !input.targetCompletedAt) return false;

  const completedAt = parsedInstant(input.targetCompletedAt);
  const createdAt = parsedInstant(row.createdAt);
  if (
    completedAt !== null &&
    createdAt !== null &&
    createdAt >= completedAt - COMPLETION_SUCCESSOR_SKEW_MS
  ) {
    return true;
  }

  const activityDueAt = input.activityScheduledDueAt;
  if (!activityDueAt || !schedulesMatch(row.dueAt, activityDueAt)) return false;

  const requestedDay = businessCalendarDate(input.requestedDueAt);
  const activityDay = businessCalendarDate(activityDueAt);
  return Boolean(requestedDay && activityDay && requestedDay === activityDay);
}

/**
 * Mark Complete closes one company cycle.
 * Older open duplicates are cancelled. A retry keeps the successor this
 * completion already created and does not schedule a second one.
 */
export function planCompanyFollowUpCompletion(input: {
  companyId: string;
  target: {
    id: string;
    companyId: string;
    status: string;
    completedAt: string | null;
  };
  pending: CompanyCycleFollowUp[];
  requestedDueAt: string;
  activityExists: boolean;
  activityScheduledDueAt?: string | null;
}): CompanyFollowUpCompletionPlan {
  const fail = (error: string): CompanyFollowUpCompletionPlan => ({
    ok: false,
    error,
    completeTarget: false,
    cancelIds: [],
    createSuccessor: false,
    keepSuccessorId: null,
    dueAt: input.requestedDueAt,
    recordActivity: false,
  });

  if (input.target.companyId !== input.companyId) {
    return fail("Follow-up does not belong to this company.");
  }

  if (!parsedInstant(input.requestedDueAt)) {
    return fail("A next follow-up date is required.");
  }

  if (input.target.status !== "pending" && input.target.status !== "completed") {
    return fail("Only pending follow-ups can be completed.");
  }

  const sameCompanyPending = input.pending.filter(
    (row) => row.companyId === input.companyId && row.id !== input.target.id,
  );

  const settled = sameCompanyPending
    .filter((row) =>
      isSettledCompletionSuccessor(row, {
        companyId: input.companyId,
        targetId: input.target.id,
        targetStatus: input.target.status,
        targetCompletedAt: input.target.completedAt,
        requestedDueAt: input.requestedDueAt,
        activityScheduledDueAt: input.activityScheduledDueAt ?? null,
      }),
    )
    .sort((left, right) => {
      const created = left.createdAt.localeCompare(right.createdAt);
      if (created !== 0) return created;
      return left.id.localeCompare(right.id);
    })[0];

  if (settled) {
    return {
      ok: true,
      error: null,
      completeTarget: false,
      cancelIds: sameCompanyPending
        .filter((row) => row.id !== settled.id)
        .map((row) => row.id),
      createSuccessor: false,
      keepSuccessorId: settled.id,
      dueAt: settled.dueAt,
      recordActivity: !input.activityExists,
    };
  }

  return {
    ok: true,
    error: null,
    completeTarget: input.target.status === "pending",
    cancelIds: sameCompanyPending.map((row) => row.id),
    createSuccessor: true,
    keepSuccessorId: null,
    dueAt: input.requestedDueAt,
    recordActivity: !input.activityExists,
  };
}

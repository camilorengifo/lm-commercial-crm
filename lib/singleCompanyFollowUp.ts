/**
 * One open follow-up per company.
 * The contact on an activity records who was managed. It does not start
 * a separate follow-up sequence.
 */

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

import { addCalendarDaysInTimeZone } from "./followUpClassification";

export const MARK_COMPLETE_INTERVAL_DAYS = 7;

/** Add calendar days in local time, preserving the scheduled hour/minute. */
export function addCalendarDaysPreservingLocalTime(
  isoDueAt: string,
  days: number,
): string {
  const date = new Date(isoDueAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid follow-up due date.");
  }

  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function isFutureDueAt(
  isoDueAt: string,
  reference: Date = new Date(),
): boolean {
  const date = new Date(isoDueAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > reference.getTime();
}

/**
 * No Response “Automatic – 1 Week”. Seven calendar days after the current due
 * date, same local time. When that instant is already in the past, seven days
 * from now at the same local time.
 *
 * Mark Complete does not use this. It closes the current row and schedules
 * the next one from the completion timestamp.
 */
export function automaticNextFollowUpDueAt(
  isoDueAt: string,
  reference: Date = new Date(),
): string {
  const fromDue = addCalendarDaysPreservingLocalTime(isoDueAt, 7);
  if (isFutureDueAt(fromDue, reference)) {
    return fromDue;
  }

  const original = new Date(isoDueAt);
  const next = new Date(reference);
  next.setHours(
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds(),
  );
  next.setDate(next.getDate() + 7);
  if (!isFutureDueAt(next.toISOString(), reference)) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

/**
 * Mark Complete next due date: exactly seven business-calendar days after
 * the completion instant. The original due date is not an input.
 */
export function nextFollowUpDueAtFromCompletion(
  completedAt: string | Date,
): string {
  const iso =
    completedAt instanceof Date ? completedAt.toISOString() : completedAt;
  return addCalendarDaysInTimeZone(iso, MARK_COMPLETE_INTERVAL_DAYS);
}

/** Fields written when a follow-up is closed. The original due date is omitted. */
export function followUpCompletionPatch(completedAt: string): {
  status: "completed";
  completed_at: string;
} {
  return {
    status: "completed",
    completed_at: completedAt,
  };
}

/**
 * Mark Complete closes the current follow-up and opens a different pending
 * row. It never rewrites the original due date.
 */
export function planMarkCompleteFollowUp(input: {
  originalDueAt: string;
  completedAt: string;
}): {
  originalDueAt: string;
  completedStatus: "completed";
  nextStatus: "pending";
  nextDueAt: string;
} {
  return {
    originalDueAt: input.originalDueAt,
    completedStatus: "completed",
    nextStatus: "pending",
    nextDueAt: nextFollowUpDueAtFromCompletion(input.completedAt),
  };
}

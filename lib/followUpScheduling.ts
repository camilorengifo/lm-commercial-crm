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
 * Automatic – 1 Week. Seven calendar days after the current due date, same
 * local time. When that instant is already in the past, seven days from now
 * at the same local time, so completing an old overdue item does not create
 * another overdue follow-up.
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

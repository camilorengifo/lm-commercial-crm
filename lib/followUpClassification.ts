/**
 * Single follow-up calendar classification for the Dashboard, Follow-ups Work
 * Center, and other CRM readers.
 *
 * Dates are stored in Postgres as timestamptz (UTC instants). "Today" is the
 * calendar date in the business timezone, America/Bogota (Colombia, UTC−5, no
 * DST). Comparing those instants to the host timezone — especially UTC on the
 * server — shifts evening follow-ups onto the previous or next day.
 */

export const BUSINESS_TIMEZONE = "America/Bogota";

export type FollowUpBucket = "overdue" | "today" | "upcoming";

/** Open work-center rows. Completed, cancelled, and do-not-follow-up are not overdue. */
export function isPendingFollowUpStatus(
  status: string | null | undefined,
): boolean {
  return status === "pending";
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  let hour = read("hour");
  if (hour === 24) hour = 0;

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/** UTC instant for a wall-clock time in the business timezone. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string = BUSINESS_TIMEZONE,
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let utc = desired;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const delta = desired - actual;
    if (delta === 0) break;
    utc += delta;
  }

  return new Date(utc + millisecond);
}

/** YYYY-MM-DD in the business timezone, or null when the value is not a date. */
export function businessCalendarDate(
  value: Date | string,
  timeZone: string = BUSINESS_TIMEZONE,
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * Add calendar days on the business calendar, keeping the wall-clock time
 * in that timezone. Colombia has no daylight-saving shift, so this is a
 * whole number of local days rather than a raw 168-hour bump that depends
 * on the machine timezone.
 */
export function addCalendarDaysInTimeZone(
  iso: string,
  days: number,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid follow-up date.");
  }

  const parts = zonedParts(date, timeZone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) + days * 86_400_000,
  );

  return zonedWallTimeToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
    timeZone,
  ).toISOString();
}

export function getDayBounds(
  reference: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
) {
  const parts = zonedParts(reference, timeZone);
  const start = zonedWallTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    0,
    0,
    timeZone,
  );
  const end = zonedWallTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    23,
    59,
    59,
    999,
    timeZone,
  );

  return { start, end };
}

export function getWeekBounds(
  reference: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
) {
  const parts = zonedParts(reference, timeZone);
  const noon = zonedWallTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    12,
    0,
    0,
    0,
    timeZone,
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const dayIndex = WEEKDAY_INDEX[weekday] ?? 0;
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const monday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + mondayOffset),
  );
  const sunday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + mondayOffset + 6),
  );

  const start = zonedWallTimeToUtc(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone,
  );
  const end = zonedWallTimeToUtc(
    sunday.getUTCFullYear(),
    sunday.getUTCMonth() + 1,
    sunday.getUTCDate(),
    23,
    59,
    59,
    999,
    timeZone,
  );

  return { start, end };
}

/**
 * Pending follow-ups only. Callers must exclude completed, cancelled, and
 * do-not-follow-up rows before bucketing.
 *
 * Overdue: due calendar date is before today.
 * Due today: due calendar date is today.
 * Upcoming: due calendar date is after today.
 */
export function getFollowUpBucket(
  dueAt: string,
  reference: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): FollowUpBucket {
  const dueKey = businessCalendarDate(dueAt, timeZone);
  const todayKey = businessCalendarDate(reference, timeZone);
  if (!dueKey || !todayKey) return "upcoming";
  if (dueKey < todayKey) return "overdue";
  if (dueKey === todayKey) return "today";
  return "upcoming";
}

/** Whole business-calendar days a pending due date is before today. */
export function getDaysOverdue(
  dueAt: string,
  reference: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): number {
  const dueKey = businessCalendarDate(dueAt, timeZone);
  const todayKey = businessCalendarDate(reference, timeZone);
  if (!dueKey || !todayKey || dueKey >= todayKey) return 0;

  const dueMs = Date.parse(`${dueKey}T00:00:00.000Z`);
  const todayMs = Date.parse(`${todayKey}T00:00:00.000Z`);
  return Math.max(1, Math.round((todayMs - dueMs) / 86_400_000));
}

/**
 * Personal workflow membership. A follow-up stays with the company owner:
 * moving the company id from one broker's set to another's moves the row
 * without copying it.
 */
export function selectFollowUpsForAssignedCompanies<
  T extends { company_id: string },
>(followUps: T[], assignedCompanyIds: ReadonlySet<string>): T[] {
  return followUps.filter((followUp) =>
    assignedCompanyIds.has(followUp.company_id),
  );
}

export function bucketFollowUpsWithCompanies<T extends { due_at: string }>(
  followUps: T[],
  reference: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): Record<FollowUpBucket, T[]> {
  const overdue: T[] = [];
  const today: T[] = [];
  const upcoming: T[] = [];

  for (const followUp of followUps) {
    const bucket = getFollowUpBucket(followUp.due_at, reference, timeZone);
    if (bucket === "overdue") overdue.push(followUp);
    else if (bucket === "today") today.push(followUp);
    else upcoming.push(followUp);
  }

  const byDueAsc = (a: T, b: T) =>
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime();

  overdue.sort(byDueAsc);
  today.sort(byDueAsc);
  upcoming.sort(byDueAsc);

  return { overdue, today, upcoming };
}

/**
 * Idempotency for follow-up creation.
 *
 * A creation key identifies one save action. It is not a uniqueness rule on
 * company, contact, or due date. Two intentional follow-ups use two keys.
 * Historical rows keep a null key and are left unchanged.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FOLLOW_UP_CREATION_KEY_MAX_LENGTH = 160;
export const SUSPECTED_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export function followUpCreationKey(input: {
  clientRequestId?: string | null;
  sourceFollowUpId?: string | null;
}): string | null {
  const sourceId = input.sourceFollowUpId?.trim();
  if (sourceId) {
    if (!isUuid(sourceId)) return null;
    return `successor:${sourceId}`;
  }

  const requestId = input.clientRequestId?.trim();
  if (requestId) {
    if (!isUuid(requestId)) return null;
    return `request:${requestId}`;
  }

  return null;
}

export function activityCreationKey(input: {
  purpose: "log" | "note";
  clientRequestId?: string | null;
}): string | null {
  const requestId = input.clientRequestId?.trim();
  if (!isUuid(requestId)) return null;
  return input.purpose === "note" ? `note:${requestId}` : `activity:${requestId}`;
}

/** One completion activity per follow-up, shared by retries of that completion. */
export function completionActivityCreationKey(
  followUpId: string | null | undefined,
): string | null {
  const id = followUpId?.trim();
  if (!isUuid(id)) return null;
  return `complete-activity:${id}`;
}

export function isUniqueViolation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("duplicate key") || message.includes("unique constraint")
  );
}

export function isMissingColumnError(
  error:
    | { code?: string; message?: string; details?: string }
    | null
    | undefined,
  column: string,
): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const name = column.toLowerCase();
  if (!blob.includes(name)) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  if (blob.includes("check constraint")) return false;
  return (
    blob.includes("schema cache") ||
    blob.includes("could not find") ||
    blob.includes("does not exist") ||
    blob.includes("column")
  );
}

export interface FollowUpInsertPlan {
  id: string;
  companyId: string;
  userId: string;
  contactId: string | null;
  dueAt: string;
  title: string;
  status: string;
  sourceFollowUpId: string | null;
  creationKey: string | null;
  createdAt: string;
}

export interface FollowUpLedgerInput {
  companyId: string;
  userId: string;
  contactId?: string | null;
  dueAt: string;
  title: string;
  status?: string;
  sourceFollowUpId?: string | null;
  clientRequestId?: string | null;
  createdAt?: string;
}

/**
 * In-memory stand-in for the partial unique indexes:
 * one row per creation key, and one successor per source follow-up.
 * Company id is intentionally not unique.
 */
export function createFollowUpLedger() {
  const rows: FollowUpInsertPlan[] = [];

  function insert(input: FollowUpLedgerInput): {
    id: string;
    created: boolean;
    dueAt: string;
  } {
    const creationKey = followUpCreationKey({
      clientRequestId: input.clientRequestId,
      sourceFollowUpId: input.sourceFollowUpId,
    });
    const sourceFollowUpId = input.sourceFollowUpId?.trim() || null;

    if (creationKey) {
      const existing = rows.find((row) => row.creationKey === creationKey);
      if (existing) {
        return { id: existing.id, created: false, dueAt: existing.dueAt };
      }
    }

    if (sourceFollowUpId) {
      const existing = rows.find(
        (row) => row.sourceFollowUpId === sourceFollowUpId,
      );
      if (existing) {
        return { id: existing.id, created: false, dueAt: existing.dueAt };
      }
    }

    const row: FollowUpInsertPlan = {
      id: `fu-${rows.length + 1}`,
      companyId: input.companyId,
      userId: input.userId,
      contactId: input.contactId ?? null,
      dueAt: input.dueAt,
      title: input.title,
      status: input.status ?? "pending",
      sourceFollowUpId,
      creationKey,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    rows.push(row);
    return { id: row.id, created: true, dueAt: row.dueAt };
  }

  return {
    rows,
    insert,
    list(): readonly FollowUpInsertPlan[] {
      return [...rows];
    },
  };
}

export interface ActivityLedgerRow {
  id: string;
  companyId: string;
  activityType: string;
  subject: string | null;
  followUpId: string | null;
  creationKey: string | null;
}

export function createActivityLedger() {
  const rows: ActivityLedgerRow[] = [];

  function insert(input: {
    companyId: string;
    activityType: string;
    subject?: string | null;
    followUpId?: string | null;
    creationKey?: string | null;
  }): { id: string; created: boolean } {
    const creationKey = input.creationKey ?? null;
    if (creationKey) {
      const existing = rows.find((row) => row.creationKey === creationKey);
      if (existing) return { id: existing.id, created: false };
    }

    const row: ActivityLedgerRow = {
      id: `act-${rows.length + 1}`,
      companyId: input.companyId,
      activityType: input.activityType,
      subject: input.subject ?? null,
      followUpId: input.followUpId ?? null,
      creationKey,
    };
    rows.push(row);
    return { id: row.id, created: true };
  }

  return { rows, insert };
}

export interface SuspectedDuplicateRow {
  id: string;
  companyId: string;
  contactId: string | null;
  dueAt: string;
  title: string;
  status: string;
  createdAt: string;
  sourceFollowUpId?: string | null;
}

/**
 * Groups rows that look like the same save landed twice.
 * Different due dates, contacts, or brokers' separate keys are not grouped.
 * This does not delete or update anything.
 */
export function groupSuspectedAccidentalDuplicates<T extends SuspectedDuplicateRow>(
  rows: T[],
  windowMs = SUSPECTED_DUPLICATE_WINDOW_MS,
): T[][] {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = [
      row.companyId,
      row.contactId ?? "",
      row.dueAt,
      row.title.trim(),
      row.status,
    ].join("\u0000");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const suspected: T[][] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    let cluster: T[] = [sorted[0]];

    const flush = () => {
      if (cluster.length >= 2) suspected.push(cluster);
    };

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = Date.parse(cluster[cluster.length - 1].createdAt);
      const next = Date.parse(sorted[index].createdAt);
      if (
        Number.isFinite(previous) &&
        Number.isFinite(next) &&
        next - previous <= windowMs
      ) {
        cluster.push(sorted[index]);
      } else {
        flush();
        cluster = [sorted[index]];
      }
    }

    flush();
  }

  return suspected;
}

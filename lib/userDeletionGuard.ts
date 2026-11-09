export function detachResultIsComplete(
  requestedIds: string[],
  updatedIds: string[],
): boolean {
  if (updatedIds.length !== requestedIds.length) return false;
  const updated = new Set(updatedIds);
  return requestedIds.every((id) => updated.has(id));
}

export function formatHistoricalDetachError(
  table: string,
  column: string,
  detail: string,
): string {
  return `This user cannot be permanently deleted because ${table}.${column} still references this account. ${detail} No companies, contacts, follow-ups, or activities were removed.`;
}

export function formatAuthDeleteBlockedMessage(detail: string): string {
  return `This account was not deleted because a database reference still points at this user. ${detail} No companies, contacts, follow-ups, or activities were removed.`;
}

import type { RawCrmData } from "@/lib/adminDashboard";

const CACHE_TTL_MS = 60_000;

let cachedRaw: RawCrmData | null = null;
let cachedAt = 0;
let inFlight: Promise<{
  data: RawCrmData | null;
  error: { message?: string } | null;
}> | null = null;

export function getCachedAdminDashboardRaw(): RawCrmData | null {
  if (!cachedRaw) return null;
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    cachedRaw = null;
    return null;
  }
  return cachedRaw;
}

export function setCachedAdminDashboardRaw(raw: RawCrmData): void {
  cachedRaw = raw;
  cachedAt = Date.now();
}

export function clearCachedAdminDashboardRaw(): void {
  cachedRaw = null;
  cachedAt = 0;
  inFlight = null;
}

export async function withAdminDashboardFetch(
  fetchFn: () => Promise<{
    data: RawCrmData | null;
    error: { message?: string } | null;
  }>,
): Promise<{
  data: RawCrmData | null;
  error: { message?: string } | null;
}> {
  const cached = getCachedAdminDashboardRaw();
  if (cached) {
    return { data: cached, error: null };
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchFn()
    .then((result) => {
      if (result.data) {
        setCachedAdminDashboardRaw(result.data);
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

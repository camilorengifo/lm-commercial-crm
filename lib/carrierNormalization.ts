export function normalizeCarrierName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMcNumber(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.toUpperCase().replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeDotNumber(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.toUpperCase().replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeScac(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase();
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
}

export function formatMcForDisplay(value: string | null): string {
  if (!value) return "—";
  const digits = normalizeMcNumber(value);
  return digits ? `MC-${digits}` : value;
}

export function formatDotForDisplay(value: string | null): string {
  if (!value) return "—";
  const digits = normalizeDotNumber(value);
  return digits ? `DOT ${digits}` : value;
}

export function formatMcDotLine(
  mc: string | null,
  dot: string | null,
): string {
  const parts = [
    mc ? formatMcForDisplay(mc) : null,
    dot ? formatDotForDisplay(dot) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "—";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidWebsite(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeWebsite(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

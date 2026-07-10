export const SUPPORTED_CARRIER_COUNTRIES = [
  "United States",
  "Canada",
  "Mexico",
] as const;

export type SupportedCarrierCountry = (typeof SUPPORTED_CARRIER_COUNTRIES)[number];

export const CARRIER_COUNTRY_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "United States", label: "United States" },
  { value: "Canada", label: "Canada" },
  { value: "Mexico", label: "Mexico" },
] as const;

const COUNTRY_ALIAS_MAP: Record<string, SupportedCarrierCountry> = {
  "united states": "United States",
  "united states of america": "United States",
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s": "United States",
  "u.s.a.": "United States",
  "u.s.a": "United States",
  canada: "Canada",
  can: "Canada",
  mexico: "Mexico",
  mx: "Mexico",
  méxico: "Mexico",
};

function aliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCarrierCountry(
  value: string | null | undefined,
): SupportedCarrierCountry | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();

  for (const country of SUPPORTED_CARRIER_COUNTRIES) {
    if (trimmed.toLowerCase() === country.toLowerCase()) {
      return country;
    }
  }

  const key = aliasKey(trimmed);
  if (key in COUNTRY_ALIAS_MAP) {
    return COUNTRY_ALIAS_MAP[key];
  }

  const withoutDots = key.replace(/\./g, "");
  if (withoutDots in COUNTRY_ALIAS_MAP) {
    return COUNTRY_ALIAS_MAP[withoutDots];
  }

  return null;
}

export function formatCarrierCountryDisplay(value: string): string {
  return normalizeCarrierCountry(value) ?? value.trim();
}

export function isSupportedCarrierCountry(
  value: string,
): value is SupportedCarrierCountry {
  return normalizeCarrierCountry(value) !== null;
}

export function validateCarrierCountry(value: string): string | null {
  if (!value.trim()) {
    return "Country is required.";
  }

  if (!normalizeCarrierCountry(value)) {
    return "Country must be United States, Canada, or Mexico.";
  }

  return null;
}

export const DEFAULT_CARRIER_COUNTRY: SupportedCarrierCountry = "United States";

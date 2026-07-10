import type { CarrierServiceAreaRow } from "@/lib/carrierDirectory";
import {
  DEFAULT_CARRIER_COUNTRY,
  formatCarrierCountryDisplay,
  normalizeCarrierCountry,
  validateCarrierCountry,
} from "@/lib/carrierCountries";

export interface ServiceAreaInput {
  country: string;
  state: string;
  city: string;
  serviceRadiusMiles: string;
}

export const EMPTY_SERVICE_AREA_INPUT: ServiceAreaInput = {
  country: DEFAULT_CARRIER_COUNTRY,
  state: "",
  city: "",
  serviceRadiusMiles: "",
};

export interface NormalizedServiceArea {
  country: string;
  state: string | null;
  city: string | null;
  service_radius_miles: number | null;
  matchKey: string;
}

export function normalizeServiceAreaInput(
  input: ServiceAreaInput,
): NormalizedServiceArea | null {
  const country = normalizeCarrierCountry(input.country);
  if (!country) {
    return null;
  }

  const state = input.state.trim() || null;
  const city = input.city.trim() || null;

  let service_radius_miles: number | null = null;
  if (input.serviceRadiusMiles.trim()) {
    const radius = Number(input.serviceRadiusMiles);
    if (!Number.isFinite(radius) || radius <= 0) {
      return null;
    }
    service_radius_miles = radius;
  }

  return {
    country,
    state,
    city,
    service_radius_miles,
    matchKey: buildServiceAreaMatchKey({ country, state, city }),
  };
}

export function buildServiceAreaMatchKey(input: {
  country: string;
  state?: string | null;
  city?: string | null;
}): string {
  const country = normalizeCarrierCountry(input.country) ?? input.country.trim();
  return [
    country.toLowerCase(),
    (input.state ?? "").trim().toLowerCase(),
    (input.city ?? "").trim().toLowerCase(),
  ].join("|");
}

export function serviceAreaRowToInput(area: CarrierServiceAreaRow): ServiceAreaInput {
  return {
    country: normalizeCarrierCountry(area.country) ?? DEFAULT_CARRIER_COUNTRY,
    state: area.state ?? "",
    city: area.city ?? "",
    serviceRadiusMiles: area.service_radius_miles
      ? String(area.service_radius_miles)
      : "",
  };
}

export function formatServiceAreaLabel(area: CarrierServiceAreaRow): string {
  const country = formatCarrierCountryDisplay(area.country);
  const parts = [area.city, area.state, country].filter(Boolean);
  const location = parts.join(", ");
  if (area.service_radius_miles) {
    return `${location} · ${area.service_radius_miles} mi radius`;
  }
  return location || country;
}

export function findDuplicateServiceArea(
  areas: CarrierServiceAreaRow[],
  candidate: ServiceAreaInput,
  excludeAreaId?: string,
): CarrierServiceAreaRow | null {
  const normalized = normalizeServiceAreaInput(candidate);
  if (!normalized) {
    return null;
  }

  for (const area of areas) {
    if (excludeAreaId && area.id === excludeAreaId) {
      continue;
    }

    const key = buildServiceAreaMatchKey({
      country: area.country,
      state: area.state,
      city: area.city,
    });

    if (key === normalized.matchKey) {
      return area;
    }
  }

  return null;
}

export function validateServiceAreaInput(input: ServiceAreaInput): string | null {
  const countryError = validateCarrierCountry(input.country);
  if (countryError) {
    return countryError;
  }

  if (input.serviceRadiusMiles.trim()) {
    const radius = Number(input.serviceRadiusMiles);
    if (!Number.isFinite(radius) || radius <= 0) {
      return "Service radius must be a positive number.";
    }
  }

  return null;
}

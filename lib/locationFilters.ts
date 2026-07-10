import { normalizeCarrierCountry } from "@/lib/carrierCountries";
import type { CarrierListItem, CarrierServiceAreaRow } from "@/lib/carrierDirectory";
import {
  findRegionByAnyToken,
  getRegionSearchTokens,
  normalizeLocationValue,
  serviceAreaStateMatchesFilter,
} from "@/lib/locationData";

export function normalizeCity(city: string): string {
  return normalizeLocationValue(city);
}

export { normalizeLocationValue };

export interface CityFilterOption {
  value: string;
  label: string;
}

function formatCityDisplay(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cityDisplayScore(value: string): number {
  if (value === value.toUpperCase() && value !== value.toLowerCase()) {
    return 0;
  }
  if (value === value.toLowerCase()) {
    return 1;
  }
  return 2;
}

function pickBetterCityDisplay(current: string, candidate: string): string {
  const currentScore = cityDisplayScore(current);
  const candidateScore = cityDisplayScore(candidate);
  if (candidateScore > currentScore) {
    return candidate;
  }
  if (currentScore > candidateScore) {
    return current;
  }
  return current.localeCompare(candidate, undefined, { sensitivity: "base" }) <= 0
    ? current
    : candidate;
}

export function getServiceAreaCity(
  area: Pick<CarrierServiceAreaRow, "city">,
): string | null {
  const city = area.city?.trim();
  return city ? city : null;
}

export function getStateAliases(
  country: string | null | undefined,
  state: string | null | undefined,
): string[] {
  return getRegionSearchTokens(country, state);
}

export function matchesCountry(
  areaCountry: string | null | undefined,
  filterCountry: string,
): boolean {
  if (filterCountry === "all") {
    return true;
  }

  const normalizedFilterCountry = normalizeCarrierCountry(filterCountry);
  const normalizedAreaCountry = normalizeCarrierCountry(areaCountry ?? "");

  if (!normalizedFilterCountry || !normalizedAreaCountry) {
    return false;
  }

  return normalizedAreaCountry === normalizedFilterCountry;
}

export function matchesState(
  areaState: string | null | undefined,
  areaCountry: string | null | undefined,
  filterState: string,
  filterCountry: string,
): boolean {
  if (filterState === "all") {
    return true;
  }

  return serviceAreaStateMatchesFilter(
    areaState,
    areaCountry,
    filterState,
    filterCountry !== "all" ? filterCountry : (areaCountry ?? ""),
  );
}

export function matchesCity(
  areaCity: string | null | undefined,
  filterCity: string,
): boolean {
  if (filterCity === "all") {
    return true;
  }

  if (!areaCity?.trim()) {
    return false;
  }

  return normalizeCity(areaCity) === normalizeCity(filterCity);
}

export function serviceAreaMatchesCountryState(input: {
  areaCountry: string | null | undefined;
  areaState: string | null | undefined;
  filterCountry: string;
  filterState: string;
}): boolean {
  if (!matchesCountry(input.areaCountry, input.filterCountry)) {
    return false;
  }

  return matchesState(
    input.areaState,
    input.areaCountry,
    input.filterState,
    input.filterCountry,
  );
}

export function serviceAreaMatchesLocationFilters(input: {
  areaCountry: string | null | undefined;
  areaState: string | null | undefined;
  areaCity: string | null | undefined;
  filterCountry: string;
  filterState: string;
  filterCity: string;
}): boolean {
  if (!serviceAreaMatchesCountryState(input)) {
    return false;
  }

  if (!matchesCity(input.areaCity, input.filterCity)) {
    return false;
  }

  return true;
}

export function carrierMatchesCountryStateFilters(
  carrier: CarrierListItem,
  filterCountry: string,
  filterState: string,
): boolean {
  if (filterCountry === "all") {
    return false;
  }

  const normalizedFilterCountry = normalizeCarrierCountry(filterCountry);
  if (!normalizedFilterCountry) {
    return false;
  }

  return (carrier.serviceAreas ?? []).some((area) =>
    serviceAreaMatchesCountryState({
      areaCountry: area.country,
      areaState: area.state,
      filterCountry,
      filterState,
    }),
  );
}

export function getAvailableCities(
  carriers: CarrierListItem[],
  filterCountry: string,
  filterState: string,
): CityFilterOption[] {
  if (filterCountry === "all") {
    return [];
  }

  const byNormalized = new Map<string, string>();

  for (const carrier of carriers) {
    for (const area of carrier.serviceAreas ?? []) {
      if (
        !serviceAreaMatchesCountryState({
          areaCountry: area.country,
          areaState: area.state,
          filterCountry,
          filterState,
        })
      ) {
        continue;
      }

      const rawCity = getServiceAreaCity(area);
      if (!rawCity) {
        continue;
      }

      const display = formatCityDisplay(rawCity);
      const normalized = normalizeCity(display);
      const existing = byNormalized.get(normalized);

      byNormalized.set(
        normalized,
        existing ? pickBetterCityDisplay(existing, display) : display,
      );
    }
  }

  return [...byNormalized.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((city) => ({ value: city, label: city }));
}

export function filterCityOptions(
  options: CityFilterOption[],
  query: string,
): CityFilterOption[] {
  const normalizedQuery = normalizeCity(query);
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) =>
    normalizeCity(option.label).includes(normalizedQuery),
  );
}

export function isCityFilterValueValid(
  filterCity: string,
  options: CityFilterOption[],
): boolean {
  if (filterCity === "all") {
    return true;
  }

  const normalized = normalizeCity(filterCity);
  return options.some(
    (option) => normalizeCity(option.value) === normalized,
  );
}

export function findRegionForArea(
  country: string | null | undefined,
  state: string | null | undefined,
) {
  return findRegionByAnyToken(country, state);
}

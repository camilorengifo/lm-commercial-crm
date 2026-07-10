import type { SupportedCarrierCountry } from "@/lib/carrierCountries";
import { normalizeCarrierCountry } from "@/lib/carrierCountries";

export interface LocationRegion {
  name: string;
  abbreviation: string;
}

export const US_STATES_AND_DC: LocationRegion[] = [
  { name: "Alabama", abbreviation: "AL" },
  { name: "Alaska", abbreviation: "AK" },
  { name: "Arizona", abbreviation: "AZ" },
  { name: "Arkansas", abbreviation: "AR" },
  { name: "California", abbreviation: "CA" },
  { name: "Colorado", abbreviation: "CO" },
  { name: "Connecticut", abbreviation: "CT" },
  { name: "Delaware", abbreviation: "DE" },
  { name: "District of Columbia", abbreviation: "DC" },
  { name: "Florida", abbreviation: "FL" },
  { name: "Georgia", abbreviation: "GA" },
  { name: "Hawaii", abbreviation: "HI" },
  { name: "Idaho", abbreviation: "ID" },
  { name: "Illinois", abbreviation: "IL" },
  { name: "Indiana", abbreviation: "IN" },
  { name: "Iowa", abbreviation: "IA" },
  { name: "Kansas", abbreviation: "KS" },
  { name: "Kentucky", abbreviation: "KY" },
  { name: "Louisiana", abbreviation: "LA" },
  { name: "Maine", abbreviation: "ME" },
  { name: "Maryland", abbreviation: "MD" },
  { name: "Massachusetts", abbreviation: "MA" },
  { name: "Michigan", abbreviation: "MI" },
  { name: "Minnesota", abbreviation: "MN" },
  { name: "Mississippi", abbreviation: "MS" },
  { name: "Missouri", abbreviation: "MO" },
  { name: "Montana", abbreviation: "MT" },
  { name: "Nebraska", abbreviation: "NE" },
  { name: "Nevada", abbreviation: "NV" },
  { name: "New Hampshire", abbreviation: "NH" },
  { name: "New Jersey", abbreviation: "NJ" },
  { name: "New Mexico", abbreviation: "NM" },
  { name: "New York", abbreviation: "NY" },
  { name: "North Carolina", abbreviation: "NC" },
  { name: "North Dakota", abbreviation: "ND" },
  { name: "Ohio", abbreviation: "OH" },
  { name: "Oklahoma", abbreviation: "OK" },
  { name: "Oregon", abbreviation: "OR" },
  { name: "Pennsylvania", abbreviation: "PA" },
  { name: "Rhode Island", abbreviation: "RI" },
  { name: "South Carolina", abbreviation: "SC" },
  { name: "South Dakota", abbreviation: "SD" },
  { name: "Tennessee", abbreviation: "TN" },
  { name: "Texas", abbreviation: "TX" },
  { name: "Utah", abbreviation: "UT" },
  { name: "Vermont", abbreviation: "VT" },
  { name: "Virginia", abbreviation: "VA" },
  { name: "Washington", abbreviation: "WA" },
  { name: "West Virginia", abbreviation: "WV" },
  { name: "Wisconsin", abbreviation: "WI" },
  { name: "Wyoming", abbreviation: "WY" },
];

export const CANADA_PROVINCES_AND_TERRITORIES: LocationRegion[] = [
  { name: "Alberta", abbreviation: "AB" },
  { name: "British Columbia", abbreviation: "BC" },
  { name: "Manitoba", abbreviation: "MB" },
  { name: "New Brunswick", abbreviation: "NB" },
  { name: "Newfoundland and Labrador", abbreviation: "NL" },
  { name: "Northwest Territories", abbreviation: "NT" },
  { name: "Nova Scotia", abbreviation: "NS" },
  { name: "Nunavut", abbreviation: "NU" },
  { name: "Ontario", abbreviation: "ON" },
  { name: "Prince Edward Island", abbreviation: "PE" },
  { name: "Quebec", abbreviation: "QC" },
  { name: "Saskatchewan", abbreviation: "SK" },
  { name: "Yukon", abbreviation: "YT" },
];

export const MEXICO_STATES: LocationRegion[] = [
  { name: "Aguascalientes", abbreviation: "AGS" },
  { name: "Baja California", abbreviation: "BC" },
  { name: "Baja California Sur", abbreviation: "BCS" },
  { name: "Campeche", abbreviation: "CAM" },
  { name: "Chiapas", abbreviation: "CHIS" },
  { name: "Chihuahua", abbreviation: "CHIH" },
  { name: "Ciudad de México", abbreviation: "CDMX" },
  { name: "Coahuila", abbreviation: "COAH" },
  { name: "Colima", abbreviation: "COL" },
  { name: "Durango", abbreviation: "DGO" },
  { name: "Guanajuato", abbreviation: "GTO" },
  { name: "Guerrero", abbreviation: "GRO" },
  { name: "Hidalgo", abbreviation: "HGO" },
  { name: "Jalisco", abbreviation: "JAL" },
  { name: "Estado de México", abbreviation: "MEX" },
  { name: "Michoacán", abbreviation: "MICH" },
  { name: "Morelos", abbreviation: "MOR" },
  { name: "Nayarit", abbreviation: "NAY" },
  { name: "Nuevo León", abbreviation: "NL" },
  { name: "Oaxaca", abbreviation: "OAX" },
  { name: "Puebla", abbreviation: "PUE" },
  { name: "Querétaro", abbreviation: "QRO" },
  { name: "Quintana Roo", abbreviation: "QROO" },
  { name: "San Luis Potosí", abbreviation: "SLP" },
  { name: "Sinaloa", abbreviation: "SIN" },
  { name: "Sonora", abbreviation: "SON" },
  { name: "Tabasco", abbreviation: "TAB" },
  { name: "Tamaulipas", abbreviation: "TAMPS" },
  { name: "Tlaxcala", abbreviation: "TLAX" },
  { name: "Veracruz", abbreviation: "VER" },
  { name: "Yucatán", abbreviation: "YUC" },
  { name: "Zacatecas", abbreviation: "ZAC" },
];

const REGIONS_BY_COUNTRY: Record<SupportedCarrierCountry, LocationRegion[]> = {
  "United States": US_STATES_AND_DC,
  Canada: CANADA_PROVINCES_AND_TERRITORIES,
  Mexico: MEXICO_STATES,
};

export function normalizeLocationValue(value: string): string {
  return value
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRegionToken(value: string): string {
  return normalizeLocationValue(value).replace(/\./g, "");
}

function buildRegionLookup(
  regions: LocationRegion[],
): Map<string, LocationRegion> {
  const lookup = new Map<string, LocationRegion>();

  for (const region of regions) {
    lookup.set(normalizeRegionToken(region.abbreviation), region);
    lookup.set(normalizeRegionToken(region.name), region);
  }

  return lookup;
}

const REGION_TOKEN_ALIASES: Record<
  SupportedCarrierCountry,
  Record<string, string>
> = {
  "United States": {},
  Canada: {},
  Mexico: {
    nle: "nl",
    "nuevo leon": "nuevo leon",
  },
};

const REGION_LOOKUP_BY_COUNTRY: Record<
  SupportedCarrierCountry,
  Map<string, LocationRegion>
> = {
  "United States": buildRegionLookup(US_STATES_AND_DC),
  Canada: buildRegionLookup(CANADA_PROVINCES_AND_TERRITORIES),
  Mexico: buildRegionLookup(MEXICO_STATES),
};

export function getRegionsForCountry(
  country: string | null | undefined,
): LocationRegion[] {
  const normalizedCountry = normalizeCarrierCountry(country ?? "");
  if (!normalizedCountry) {
    return [];
  }
  return REGIONS_BY_COUNTRY[normalizedCountry];
}

export function getStateFilterOptionsForCountry(
  country: string,
): LocationRegion[] {
  if (country === "all") {
    return [];
  }
  return getRegionsForCountry(country);
}

export function formatRegionOptionLabel(region: LocationRegion): string {
  return `${region.name} (${region.abbreviation})`;
}

export function findRegionByAbbreviation(
  country: string,
  abbreviation: string,
): LocationRegion | null {
  const normalizedCountry = normalizeCarrierCountry(country);
  if (!normalizedCountry || !abbreviation.trim()) {
    return null;
  }

  const lookup = REGION_LOOKUP_BY_COUNTRY[normalizedCountry];
  return lookup.get(normalizeRegionToken(abbreviation)) ?? null;
}

export function findRegionByAnyToken(
  country: string | null | undefined,
  token: string | null | undefined,
): LocationRegion | null {
  const normalizedCountry = normalizeCarrierCountry(country ?? "");
  if (!normalizedCountry || !token?.trim()) {
    return null;
  }

  const lookup = REGION_LOOKUP_BY_COUNTRY[normalizedCountry];
  const normalizedToken = normalizeRegionToken(token);
  const aliasedToken =
    REGION_TOKEN_ALIASES[normalizedCountry][normalizedToken] ?? normalizedToken;
  return lookup.get(aliasedToken) ?? null;
}

export function formatRegionFilterLabel(
  country: string,
  filterValue: string,
): string {
  if (filterValue === "all") {
    return "All";
  }

  const region = findRegionByAbbreviation(country, filterValue);
  return region ? formatRegionOptionLabel(region) : filterValue;
}

export function serviceAreaStateMatchesFilter(
  areaState: string | null | undefined,
  areaCountry: string | null | undefined,
  filterState: string,
  filterCountry: string,
): boolean {
  if (filterState === "all") {
    return Boolean(areaState?.trim());
  }

  if (!areaState?.trim()) {
    return false;
  }

  const filterRegion = findRegionByAbbreviation(filterCountry, filterState);
  const areaRegion = findRegionByAnyToken(areaCountry, areaState);

  if (filterRegion && areaRegion) {
    return filterRegion.abbreviation === areaRegion.abbreviation;
  }

  if (filterRegion) {
    const areaNorm = normalizeRegionToken(areaState);
    return (
      areaNorm === normalizeRegionToken(filterRegion.abbreviation) ||
      areaNorm === normalizeRegionToken(filterRegion.name)
    );
  }

  if (areaRegion) {
    const filterNorm = normalizeRegionToken(filterState);
    return (
      filterNorm === normalizeRegionToken(areaRegion.abbreviation) ||
      filterNorm === normalizeRegionToken(areaRegion.name)
    );
  }

  return normalizeRegionToken(areaState) === normalizeRegionToken(filterState);
}

export function getRegionSearchTokens(
  country: string | null | undefined,
  state: string | null | undefined,
): string[] {
  if (!state?.trim()) {
    return [];
  }

  const region = findRegionByAnyToken(country, state);
  if (!region) {
    return [state];
  }

  return [region.name, region.abbreviation];
}

export function searchMatchesRegion(
  search: string,
  country: string | null | undefined,
  state: string | null | undefined,
): boolean {
  const normalizedSearch = normalizeRegionToken(search);
  if (!normalizedSearch) {
    return true;
  }

  for (const token of getRegionSearchTokens(country, state)) {
    const normalizedToken = normalizeRegionToken(token);
    if (
      normalizedToken.includes(normalizedSearch) ||
      normalizedSearch.includes(normalizedToken)
    ) {
      return true;
    }
  }

  return false;
}

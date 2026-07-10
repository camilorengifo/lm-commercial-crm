import {
  formatRegionFilterLabel,
  getRegionSearchTokens,
  normalizeLocationValue,
  serviceAreaStateMatchesFilter,
} from "@/lib/locationData";
import { serviceAreaMatchesLocationFilters } from "@/lib/locationFilters";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatCarrierCountryDisplay,
  normalizeCarrierCountry,
} from "@/lib/carrierCountries";
import type {
  BondedFilter,
  CarrierEquipmentType,
  CarrierServiceType,
  CarrierStatus,
  HazmatFilter,
  RelationshipStatus,
} from "@/lib/carrierConstants";
import {
  formatCarrierStatus,
  formatEquipmentType,
  formatServiceType,
  RELATIONSHIP_STATUS_LABELS,
} from "@/lib/carrierConstants";
import {
  normalizeCarrierName,
  normalizeDotNumber,
  normalizeEmail,
  normalizeMcNumber,
  normalizePhone,
  normalizeScac,
} from "@/lib/carrierNormalization";
import { supabase } from "@/lib/supabaseClient";

export interface CarrierContactRow {
  id: string;
  carrier_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface CarrierServiceAreaRow {
  id: string;
  carrier_id: string;
  country: string;
  state: string | null;
  city: string | null;
  service_radius_miles: number | null;
}

export interface CarrierRow {
  id: string;
  legal_name: string;
  normalized_name: string | null;
  dba_name: string | null;
  mc_number: string | null;
  dot_number: string | null;
  scac: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  is_bonded: boolean;
  is_hazmat: boolean;
  status: CarrierStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  carrier_services?: Array<{ service_type: CarrierServiceType }>;
  carrier_equipment?: Array<{ equipment_type: CarrierEquipmentType }>;
  carrier_service_areas?: CarrierServiceAreaRow[];
  carrier_contacts?: CarrierContactRow[];
}

export interface UserCarrierRow {
  id: string;
  user_id: string;
  carrier_id: string;
  private_notes: string | null;
  is_preferred: boolean;
  relationship_status: RelationshipStatus | null;
  last_contacted_at: string | null;
  preferred_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarrierListItem extends CarrierRow {
  services: CarrierServiceType[];
  equipment: CarrierEquipmentType[];
  serviceAreas: CarrierServiceAreaRow[];
  contacts: CarrierContactRow[];
  userRelationship?: UserCarrierRow | null;
}

export interface CarrierDirectoryFilters {
  search: string;
  serviceType: CarrierServiceType | "all";
  equipmentType: CarrierEquipmentType | "all";
  country: string;
  state: string;
  city: string;
  status: CarrierStatus | "all";
  bonded: BondedFilter;
  hazmat: HazmatFilter;
  preferredOnly: boolean;
  relationshipStatus: RelationshipStatus | "all";
}

export const EMPTY_CARRIER_DIRECTORY_FILTERS: CarrierDirectoryFilters = {
  search: "",
  serviceType: "all",
  equipmentType: "all",
  country: "all",
  state: "all",
  city: "all",
  status: "all",
  bonded: "all",
  hazmat: "all",
  preferredOnly: false,
  relationshipStatus: "all",
};

const CARRIER_LIST_SELECT = `
  id,
  legal_name,
  normalized_name,
  dba_name,
  mc_number,
  dot_number,
  scac,
  phone,
  email,
  website,
  is_bonded,
  is_hazmat,
  status,
  created_by,
  updated_by,
  created_at,
  updated_at,
  carrier_services(service_type),
  carrier_equipment(equipment_type),
  carrier_service_areas(id, carrier_id, country, state, city, service_radius_miles),
  carrier_contacts(id, carrier_id, name, role, phone, email, is_primary)
`;

function mapCarrierRow(row: CarrierRow): CarrierListItem {
  return {
    ...row,
    services: (row.carrier_services ?? []).map((item) => item.service_type),
    equipment: (row.carrier_equipment ?? []).map((item) => item.equipment_type),
    serviceAreas: row.carrier_service_areas ?? [],
    contacts: row.carrier_contacts ?? [],
  };
}

export function carrierMatchesSearch(carrier: CarrierListItem, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    carrier.legal_name,
    carrier.dba_name,
    carrier.mc_number,
    carrier.dot_number,
    carrier.scac,
    carrier.phone,
    carrier.email,
    ...(carrier.serviceAreas ?? []).flatMap((area) => [
      area.city,
      area.city ? normalizeLocationValue(area.city) : null,
      area.state,
      area.country,
      formatCarrierCountryDisplay(area.country),
      ...getRegionSearchTokens(area.country, area.state),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function carrierMatchesFilters(
  carrier: CarrierListItem,
  filters: CarrierDirectoryFilters,
): boolean {
  if (!carrierMatchesSearch(carrier, filters.search)) {
    return false;
  }

  if (filters.serviceType !== "all" && !carrier.services.includes(filters.serviceType)) {
    return false;
  }

  if (
    filters.equipmentType !== "all" &&
    !carrier.equipment.includes(filters.equipmentType)
  ) {
    return false;
  }

  if (filters.status !== "all" && carrier.status !== filters.status) {
    return false;
  }

  if (filters.bonded === "bonded" && !carrier.is_bonded) return false;
  if (filters.bonded === "not_bonded" && carrier.is_bonded) return false;

  if (filters.hazmat === "hazmat" && !carrier.is_hazmat) return false;
  if (filters.hazmat === "not_hazmat" && carrier.is_hazmat) return false;

  if (filters.country !== "all") {
    const filterCountry = normalizeCarrierCountry(filters.country);
    const hasCountry = carrier.serviceAreas.some(
      (area) => normalizeCarrierCountry(area.country) === filterCountry,
    );
    if (!hasCountry) return false;
  }

  if (filters.state !== "all") {
    const filterCountry =
      filters.country !== "all"
        ? normalizeCarrierCountry(filters.country)
        : null;
    const hasState = carrier.serviceAreas.some((area) => {
      if (
        filterCountry &&
        normalizeCarrierCountry(area.country) !== filterCountry
      ) {
        return false;
      }

      return serviceAreaStateMatchesFilter(
        area.state,
        area.country,
        filters.state,
        filters.country !== "all" ? filters.country : (area.country ?? ""),
      );
    });
    if (!hasState) return false;
  }

  if (filters.city !== "all") {
    const hasCity = carrier.serviceAreas.some((area) =>
      serviceAreaMatchesLocationFilters({
        areaCountry: area.country,
        areaState: area.state,
        areaCity: area.city,
        filterCountry: filters.country,
        filterState: filters.state,
        filterCity: filters.city,
      }),
    );
    if (!hasCity) return false;
  }

  if (filters.preferredOnly && !carrier.userRelationship?.is_preferred) {
    return false;
  }

  if (
    filters.relationshipStatus !== "all" &&
    carrier.userRelationship?.relationship_status !== filters.relationshipStatus
  ) {
    return false;
  }

  return true;
}

export function getActiveFilterChips(
  filters: CarrierDirectoryFilters,
  tab: "network" | "my",
): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];

  if (filters.search.trim()) {
    chips.push({ key: "search", label: `Search: ${filters.search.trim()}` });
  }
  if (filters.serviceType !== "all") {
    chips.push({
      key: "serviceType",
      label: `Service: ${formatServiceType(filters.serviceType)}`,
    });
  }
  if (filters.equipmentType !== "all") {
    chips.push({
      key: "equipmentType",
      label: `Equipment: ${formatEquipmentType(filters.equipmentType)}`,
    });
  }
  if (filters.country !== "all") {
    chips.push({
      key: "country",
      label: `Country: ${formatCarrierCountryDisplay(filters.country)}`,
    });
  }
  if (filters.state !== "all") {
    chips.push({
      key: "state",
      label: `State: ${formatRegionFilterLabel(filters.country, filters.state)}`,
    });
  }
  if (filters.city !== "all") {
    chips.push({ key: "city", label: `City: ${filters.city}` });
  }
  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: `Status: ${formatCarrierStatus(filters.status)}`,
    });
  }
  if (filters.bonded !== "all") {
    chips.push({
      key: "bonded",
      label: filters.bonded === "bonded" ? "Bonded only" : "Not bonded",
    });
  }
  if (filters.hazmat !== "all") {
    chips.push({
      key: "hazmat",
      label: filters.hazmat === "hazmat" ? "Hazmat only" : "Not hazmat",
    });
  }
  if (tab === "my" && filters.preferredOnly) {
    chips.push({ key: "preferredOnly", label: "Preferred only" });
  }
  if (tab === "my" && filters.relationshipStatus !== "all") {
    chips.push({
      key: "relationshipStatus",
      label: `Relationship: ${RELATIONSHIP_STATUS_LABELS[filters.relationshipStatus]}`,
    });
  }

  return chips;
}

export function summarizeCoverage(carrier: CarrierListItem): string {
  if (carrier.serviceAreas.length === 0) {
    return "—";
  }

  const labels = carrier.serviceAreas.slice(0, 3).map((area) => {
    const parts = [
      area.city,
      area.state,
      formatCarrierCountryDisplay(area.country),
    ].filter(Boolean);
    return parts.join(", ");
  });

  if (carrier.serviceAreas.length > 3) {
    labels.push(`+${carrier.serviceAreas.length - 3} more`);
  }

  return labels.join(" · ");
}

export async function fetchCarrierNetwork(): Promise<{
  data: CarrierListItem[];
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("carriers")
    .select(CARRIER_LIST_SELECT)
    .order("legal_name", { ascending: true });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data as CarrierRow[]).map(mapCarrierRow),
    error: null,
  };
}

export async function fetchMyCarriers(userId: string): Promise<{
  data: CarrierListItem[];
  error: { message?: string } | null;
}> {
  const { data: links, error: linksError } = await supabase
    .from("user_carriers")
    .select("*")
    .eq("user_id", userId);

  if (linksError) {
    return { data: [], error: linksError };
  }

  const relationshipByCarrierId = new Map(
    (links ?? []).map((link) => [link.carrier_id, link as UserCarrierRow]),
  );

  if (relationshipByCarrierId.size === 0) {
    return { data: [], error: null };
  }

  const carrierIds = [...relationshipByCarrierId.keys()];

  const { data, error } = await supabase
    .from("carriers")
    .select(CARRIER_LIST_SELECT)
    .in("id", carrierIds)
    .order("legal_name", { ascending: true });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data as CarrierRow[]).map((row) => ({
      ...mapCarrierRow(row),
      userRelationship: relationshipByCarrierId.get(row.id) ?? null,
    })),
    error: null,
  };
}

export async function fetchCarrierDetail(carrierId: string): Promise<{
  data: CarrierListItem | null;
  userRelationship: UserCarrierRow | null;
  error: { message?: string } | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("carriers")
    .select(CARRIER_LIST_SELECT)
    .eq("id", carrierId)
    .maybeSingle();

  if (error) {
    return { data: null, userRelationship: null, error };
  }

  if (!data) {
    return { data: null, userRelationship: null, error: null };
  }

  let userRelationship: UserCarrierRow | null = null;
  if (user) {
    const { data: link } = await supabase
      .from("user_carriers")
      .select("*")
      .eq("user_id", user.id)
      .eq("carrier_id", carrierId)
      .maybeSingle();

    userRelationship = (link as UserCarrierRow | null) ?? null;
  }

  return {
    data: mapCarrierRow(data as CarrierRow),
    userRelationship,
    error: null,
  };
}

export interface DuplicateCarrierMatch {
  carrier: CarrierListItem;
  matchedBy: "dot" | "mc" | "scac" | "name" | "phone" | "email";
}

export async function findDuplicateCarrier(
  client: SupabaseClient,
  input: {
    legalName: string;
    mcNumber?: string | null;
    dotNumber?: string | null;
    scac?: string | null;
    phone?: string | null;
    email?: string | null;
    excludeCarrierId?: string;
  },
): Promise<DuplicateCarrierMatch | null> {
  const normalizedName = normalizeCarrierName(input.legalName);
  const normalizedMc = normalizeMcNumber(input.mcNumber);
  const normalizedDot = normalizeDotNumber(input.dotNumber);
  const normalizedScac = normalizeScac(input.scac);
  const normalizedPhone = normalizePhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);

  const { data, error } = await client
    .from("carriers")
    .select(CARRIER_LIST_SELECT);

  if (error || !data) {
    return null;
  }

  for (const row of data as CarrierRow[]) {
    if (input.excludeCarrierId && row.id === input.excludeCarrierId) {
      continue;
    }

    const carrier = mapCarrierRow(row);

    if (normalizedDot && normalizeDotNumber(row.dot_number) === normalizedDot) {
      return { carrier, matchedBy: "dot" };
    }

    if (normalizedMc && normalizeMcNumber(row.mc_number) === normalizedMc) {
      return { carrier, matchedBy: "mc" };
    }

    if (normalizedScac && normalizeScac(row.scac) === normalizedScac) {
      return { carrier, matchedBy: "scac" };
    }

    if (
      normalizedName &&
      row.normalized_name &&
      row.normalized_name === normalizedName
    ) {
      return { carrier, matchedBy: "name" };
    }

    if (
      normalizedPhone &&
      normalizePhone(row.phone) === normalizedPhone
    ) {
      return { carrier, matchedBy: "phone" };
    }

    if (
      normalizedEmail &&
      normalizeEmail(row.email) === normalizedEmail
    ) {
      return { carrier, matchedBy: "email" };
    }
  }

  return null;
}

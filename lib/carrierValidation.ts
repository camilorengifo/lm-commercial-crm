import {
  CARRIER_EQUIPMENT_TYPES,
  CARRIER_SERVICE_TYPES,
  isCarrierEquipmentType,
  isCarrierServiceType,
  isCarrierStatus,
  type CarrierEquipmentType,
  type CarrierServiceType,
  type CarrierStatus,
  type RelationshipStatus,
} from "@/lib/carrierConstants";
import {
  DEFAULT_CARRIER_COUNTRY,
  validateCarrierCountry,
} from "@/lib/carrierCountries";
import {
  isValidEmail,
  isValidWebsite,
  normalizeCarrierName,
  normalizeDotNumber,
  normalizeEmail,
  normalizeMcNumber,
  normalizeScac,
  normalizeWebsite,
} from "@/lib/carrierNormalization";

export interface CarrierContactInput {
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface CarrierServiceAreaInput {
  country: string;
  state: string;
  city: string;
  serviceRadiusMiles: string;
}

export interface CarrierFormInput {
  legalName: string;
  dbaName: string;
  mcNumber: string;
  dotNumber: string;
  scac: string;
  phone: string;
  email: string;
  website: string;
  status: CarrierStatus;
  isBonded: boolean;
  isHazmat: boolean;
  serviceTypes: CarrierServiceType[];
  equipmentTypes: CarrierEquipmentType[];
  serviceAreas: CarrierServiceAreaInput[];
  contacts: CarrierContactInput[];
}

export const EMPTY_CARRIER_CONTACT: CarrierContactInput = {
  name: "",
  role: "Dispatch",
  phone: "",
  email: "",
  isPrimary: true,
};

export const EMPTY_CARRIER_SERVICE_AREA: CarrierServiceAreaInput = {
  country: DEFAULT_CARRIER_COUNTRY,
  state: "",
  city: "",
  serviceRadiusMiles: "",
};

export const EMPTY_CARRIER_FORM: CarrierFormInput = {
  legalName: "",
  dbaName: "",
  mcNumber: "",
  dotNumber: "",
  scac: "",
  phone: "",
  email: "",
  website: "",
  status: "pending_verification",
  isBonded: false,
  isHazmat: false,
  serviceTypes: [],
  equipmentTypes: [],
  serviceAreas: [EMPTY_CARRIER_SERVICE_AREA],
  contacts: [EMPTY_CARRIER_CONTACT],
};

export function validateCarrierForm(input: CarrierFormInput): string | null {
  if (!input.legalName.trim()) {
    return "Legal carrier name is required.";
  }

  if (input.email.trim() && !isValidEmail(input.email)) {
    return "Enter a valid main email address.";
  }

  if (input.website.trim() && !isValidWebsite(input.website)) {
    return "Enter a valid website URL.";
  }

  if (input.mcNumber.trim() && !normalizeMcNumber(input.mcNumber)) {
    return "Enter a valid MC number.";
  }

  if (input.dotNumber.trim() && !normalizeDotNumber(input.dotNumber)) {
    return "Enter a valid DOT number.";
  }

  if (!isCarrierStatus(input.status)) {
    return "Invalid carrier status.";
  }

  for (const serviceType of input.serviceTypes) {
    if (!isCarrierServiceType(serviceType)) {
      return "Invalid service type selected.";
    }
  }

  for (const equipmentType of input.equipmentTypes) {
    if (!isCarrierEquipmentType(equipmentType)) {
      return "Invalid equipment type selected.";
    }
  }

  for (const area of input.serviceAreas) {
    if (!area.country.trim() && !area.state.trim() && !area.city.trim()) {
      continue;
    }

    const countryError = validateCarrierCountry(area.country);
    if (countryError) {
      return countryError;
    }

    if (area.serviceRadiusMiles.trim()) {
      const radius = Number(area.serviceRadiusMiles);
      if (!Number.isFinite(radius) || radius <= 0) {
        return "Service radius must be a positive number.";
      }
    }
  }

  for (const contact of input.contacts) {
    if (!contact.name.trim()) continue;
    if (contact.email.trim() && !isValidEmail(contact.email)) {
      return `Enter a valid email for contact ${contact.name.trim()}.`;
    }
  }

  return null;
}

export function buildCarrierInsertPayload(input: CarrierFormInput) {
  return {
    legal_name: input.legalName.trim(),
    normalized_name: normalizeCarrierName(input.legalName),
    dba_name: input.dbaName.trim() || null,
    mc_number: normalizeMcNumber(input.mcNumber),
    dot_number: normalizeDotNumber(input.dotNumber),
    scac: normalizeScac(input.scac),
    phone: input.phone.trim() || null,
    email: normalizeEmail(input.email),
    website: normalizeWebsite(input.website),
    is_bonded: Boolean(input.isBonded),
    is_hazmat: Boolean(input.isHazmat),
    status: input.status,
  };
}

export function parseCarrierServiceTypes(values: string[]): CarrierServiceType[] {
  return values.filter((value): value is CarrierServiceType =>
    CARRIER_SERVICE_TYPES.includes(value as CarrierServiceType),
  );
}

export function parseCarrierEquipmentTypes(
  values: string[],
): CarrierEquipmentType[] {
  return values.filter((value): value is CarrierEquipmentType =>
    CARRIER_EQUIPMENT_TYPES.includes(value as CarrierEquipmentType),
  );
}

export function parseCarrierStatus(value: string): CarrierStatus {
  return isCarrierStatus(value) ? value : "pending_verification";
}

export function parseRelationshipStatus(
  value: string,
): RelationshipStatus | null {
  if (!value || value === "all") return null;
  return value as RelationshipStatus;
}

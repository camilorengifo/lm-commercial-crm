export const CARRIER_STATUSES = [
  "pending_verification",
  "active",
  "inactive",
  "do_not_use",
] as const;

export type CarrierStatus = (typeof CARRIER_STATUSES)[number];

export const CARRIER_SERVICE_TYPES = [
  "ftl",
  "ltl",
  "drayage",
  "heavy_haul",
] as const;

export type CarrierServiceType = (typeof CARRIER_SERVICE_TYPES)[number];

export const CARRIER_EQUIPMENT_TYPES = [
  "dry_van",
  "reefer",
  "flatbed",
  "step_deck",
  "conestoga",
  "power_only",
  "box_truck",
  "straight_truck",
  "sprinter_van",
  "lowboy",
  "rgn",
  "tanker",
  "intermodal",
] as const;

export type CarrierEquipmentType = (typeof CARRIER_EQUIPMENT_TYPES)[number];

export const CARRIER_CONTACT_ROLES = [
  "Dispatch",
  "Safety",
  "Accounting",
  "Owner",
  "Sales",
  "Operations",
  "Other",
] as const;

export type CarrierContactRole = (typeof CARRIER_CONTACT_ROLES)[number];

export const RELATIONSHIP_STATUSES = [
  "active",
  "prospect",
  "on_hold",
  "inactive",
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const CARRIER_STATUS_LABELS: Record<CarrierStatus, string> = {
  pending_verification: "Pending Verification",
  active: "Active",
  inactive: "Inactive",
  do_not_use: "Do Not Use",
};

export const CARRIER_SERVICE_LABELS: Record<CarrierServiceType, string> = {
  ftl: "FTL",
  ltl: "LTL",
  drayage: "Drayage",
  heavy_haul: "Heavy Haul",
};

export const CARRIER_EQUIPMENT_LABELS: Record<CarrierEquipmentType, string> = {
  dry_van: "Dry Van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  step_deck: "Step Deck",
  conestoga: "Conestoga",
  power_only: "Power Only",
  box_truck: "Box Truck",
  straight_truck: "Straight Truck",
  sprinter_van: "Sprinter Van",
  lowboy: "Lowboy",
  rgn: "RGN",
  tanker: "Tanker",
  intermodal: "Intermodal",
};

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  active: "Active",
  prospect: "Prospect",
  on_hold: "On Hold",
  inactive: "Inactive",
};

export type BondedFilter = "all" | "bonded" | "not_bonded";
export type HazmatFilter = "all" | "hazmat" | "not_hazmat";

export function carrierStatusBadgeClass(status: CarrierStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "pending_verification":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "inactive":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "do_not_use":
      return "bg-red-50 text-red-800 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function bondedBadgeClass(isBonded: boolean): string {
  return isBonded
    ? "bg-blue-50 text-blue-800 ring-blue-200"
    : "bg-slate-100 text-slate-600 ring-slate-200";
}

export function hazmatBadgeClass(isHazmat: boolean): string {
  return isHazmat
    ? "bg-orange-50 text-orange-800 ring-orange-200"
    : "bg-slate-100 text-slate-600 ring-slate-200";
}

export function formatCarrierStatus(status: string): string {
  if (status in CARRIER_STATUS_LABELS) {
    return CARRIER_STATUS_LABELS[status as CarrierStatus];
  }
  return status;
}

export function formatServiceType(value: string): string {
  if (value in CARRIER_SERVICE_LABELS) {
    return CARRIER_SERVICE_LABELS[value as CarrierServiceType];
  }
  return value;
}

export function formatEquipmentType(value: string): string {
  if (value in CARRIER_EQUIPMENT_LABELS) {
    return CARRIER_EQUIPMENT_LABELS[value as CarrierEquipmentType];
  }
  return value;
}

export function formatRelationshipStatus(value: string | null): string {
  if (!value) return "—";
  if (value in RELATIONSHIP_STATUS_LABELS) {
    return RELATIONSHIP_STATUS_LABELS[value as RelationshipStatus];
  }
  return value;
}

export function isCarrierStatus(value: string): value is CarrierStatus {
  return (CARRIER_STATUSES as readonly string[]).includes(value);
}

export function isCarrierServiceType(value: string): value is CarrierServiceType {
  return (CARRIER_SERVICE_TYPES as readonly string[]).includes(value);
}

export function isCarrierEquipmentType(
  value: string,
): value is CarrierEquipmentType {
  return (CARRIER_EQUIPMENT_TYPES as readonly string[]).includes(value);
}

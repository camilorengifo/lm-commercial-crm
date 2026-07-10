import { normalizeCarrierCountry } from "@/lib/carrierCountries";
import type { CarrierListItem } from "@/lib/carrierDirectory";
import type { CarrierFormInput } from "@/lib/carrierValidation";

export function carrierToForm(carrier: CarrierListItem): CarrierFormInput {
  return {
    legalName: carrier.legal_name,
    dbaName: carrier.dba_name ?? "",
    mcNumber: carrier.mc_number ?? "",
    dotNumber: carrier.dot_number ?? "",
    scac: carrier.scac ?? "",
    phone: carrier.phone ?? "",
    email: carrier.email ?? "",
    website: carrier.website ?? "",
    status: carrier.status,
    isBonded: carrier.is_bonded,
    isHazmat: carrier.is_hazmat,
    serviceTypes: carrier.services,
    equipmentTypes: carrier.equipment,
    serviceAreas: carrier.serviceAreas.map((area) => ({
      country: normalizeCarrierCountry(area.country) ?? area.country,
      state: area.state ?? "",
      city: area.city ?? "",
      serviceRadiusMiles: area.service_radius_miles
        ? String(area.service_radius_miles)
        : "",
    })),
    contacts: carrier.contacts.map((contact) => ({
      name: contact.name,
      role: contact.role ?? "Dispatch",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      isPrimary: contact.is_primary,
    })),
  };
}

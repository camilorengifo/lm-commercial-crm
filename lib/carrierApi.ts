import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCarrierCountry } from "@/lib/carrierCountries";
import {
  findDuplicateCarrier,
  type CarrierListItem,
} from "@/lib/carrierDirectory";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import { buildCarrierInsertPayload, validateCarrierForm } from "@/lib/carrierValidation";
import { isAdminProfile } from "@/lib/userProfile";
import type { UserProfile } from "@/lib/userProfile";

function mapServiceAreasForInsert(
  carrierId: string,
  areas: CarrierFormInput["serviceAreas"],
) {
  return areas
    .filter((area) => area.country.trim())
    .map((area) => {
      const country = normalizeCarrierCountry(area.country);
      if (!country) {
        throw new Error("Invalid service area country.");
      }

      return {
        carrier_id: carrierId,
        country,
        state: area.state.trim() || null,
        city: area.city.trim() || null,
        service_radius_miles: area.serviceRadiusMiles.trim()
          ? Number(area.serviceRadiusMiles)
          : null,
      };
    });
}

export async function ensureNoDuplicateCarrier(
  supabase: SupabaseClient,
  input: CarrierFormInput,
  excludeCarrierId?: string,
): Promise<{ duplicate: CarrierListItem | null; matchedBy: string | null }> {
  const match = await findDuplicateCarrier(supabase, {
    legalName: input.legalName,
    mcNumber: input.mcNumber,
    dotNumber: input.dotNumber,
    scac: input.scac,
    phone: input.phone,
    email: input.email,
    excludeCarrierId,
  });

  if (!match) {
    return { duplicate: null, matchedBy: null };
  }

  return { duplicate: match.carrier, matchedBy: match.matchedBy };
}

export async function insertCarrierWithChildren(
  supabase: SupabaseClient,
  _userId: string,
  input: CarrierFormInput,
  options?: { linkToUser?: boolean },
): Promise<{ carrierId: string | null; error: string | null }> {
  const validationError = validateCarrierForm(input);
  if (validationError) {
    return { carrierId: null, error: validationError };
  }

  const duplicate = await ensureNoDuplicateCarrier(supabase, input);
  if (duplicate.duplicate) {
    return {
      carrierId: null,
      error: "DUPLICATE",
    };
  }

  const serviceAreas = input.serviceAreas
    .filter((area) => area.country.trim())
    .map((area) => {
      const country = normalizeCarrierCountry(area.country);
      if (!country) {
        throw new Error("Invalid service area country.");
      }

      return {
        country,
        state: area.state.trim() || null,
        city: area.city.trim() || null,
        service_radius_miles: area.serviceRadiusMiles.trim()
          ? Number(area.serviceRadiusMiles)
          : null,
      };
    });

  const contacts = input.contacts
    .filter((contact) => contact.name.trim())
    .map((contact) => ({
      name: contact.name.trim(),
      role: contact.role.trim() || null,
      phone: contact.phone.trim() || null,
      email: contact.email.trim() || null,
      is_primary: contact.isPrimary,
    }));

  const payload = buildCarrierInsertPayload(input);

  let rpcPayload;
  try {
    rpcPayload = {
      legal_name: payload.legal_name,
      dba_name: payload.dba_name,
      mc_number: payload.mc_number,
      dot_number: payload.dot_number,
      scac: payload.scac,
      phone: payload.phone,
      email: payload.email,
      website: payload.website,
      is_bonded: payload.is_bonded,
      is_hazmat: payload.is_hazmat,
      status: payload.status,
      service_types: input.serviceTypes,
      equipment_types: input.equipmentTypes,
      service_areas: serviceAreas,
      contacts,
      link_to_user: options?.linkToUser !== false,
    };
  } catch (error) {
    return {
      carrierId: null,
      error:
        error instanceof Error
          ? error.message
          : "Invalid service area country.",
    };
  }

  const { data, error } = await supabase.rpc("create_carrier_with_children", {
    p_payload: rpcPayload,
  });

  if (error || !data) {
    return {
      carrierId: null,
      error: error?.message ?? "Unable to create carrier.",
    };
  }

  return { carrierId: data as string, error: null };
}

export async function replaceCarrierChildren(
  supabase: SupabaseClient,
  userId: string,
  carrierId: string,
  input: CarrierFormInput,
): Promise<{ error: string | null }> {
  await supabase.from("carrier_services").delete().eq("carrier_id", carrierId);
  await supabase.from("carrier_equipment").delete().eq("carrier_id", carrierId);
  await supabase
    .from("carrier_service_areas")
    .delete()
    .eq("carrier_id", carrierId);
  await supabase.from("carrier_contacts").delete().eq("carrier_id", carrierId);

  if (input.serviceTypes.length > 0) {
    const { error } = await supabase.from("carrier_services").insert(
      input.serviceTypes.map((serviceType) => ({
        carrier_id: carrierId,
        service_type: serviceType,
      })),
    );
    if (error) return { error: error.message };
  }

  if (input.equipmentTypes.length > 0) {
    const { error } = await supabase.from("carrier_equipment").insert(
      input.equipmentTypes.map((equipmentType) => ({
        carrier_id: carrierId,
        equipment_type: equipmentType,
      })),
    );
    if (error) return { error: error.message };
  }

  const serviceAreas = input.serviceAreas.filter((area) => area.country.trim());
  if (serviceAreas.length > 0) {
    let rows;
    try {
      rows = mapServiceAreasForInsert(carrierId, serviceAreas);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Invalid service area country.",
      };
    }

    const { error } = await supabase.from("carrier_service_areas").insert(rows);
    if (error) return { error: error.message };
  }

  const contacts = input.contacts.filter((contact) => contact.name.trim());
  if (contacts.length > 0) {
    const { error } = await supabase.from("carrier_contacts").insert(
      contacts.map((contact) => ({
        carrier_id: carrierId,
        name: contact.name.trim(),
        role: contact.role.trim() || null,
        phone: contact.phone.trim() || null,
        email: contact.email.trim() || null,
        is_primary: contact.isPrimary,
        created_by: userId,
      })),
    );
    if (error) return { error: error.message };
  }

  return { error: null };
}

export function assertCanSetCarrierStatus(
  profile: UserProfile | null | undefined,
  status: string,
): string | null {
  if (status === "do_not_use" && !isAdminProfile(profile)) {
    return "Only admins can mark a carrier as Do Not Use.";
  }
  return null;
}

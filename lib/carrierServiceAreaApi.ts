import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarrierServiceAreaRow } from "@/lib/carrierDirectory";
import {
  findDuplicateServiceArea,
  normalizeServiceAreaInput,
  type ServiceAreaInput,
  validateServiceAreaInput,
} from "@/lib/carrierServiceAreas";

async function touchCarrierUpdatedAt(
  supabase: SupabaseClient,
  carrierId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("carriers")
    .update({ updated_by: userId })
    .eq("id", carrierId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

async function fetchCarrierServiceAreas(
  supabase: SupabaseClient,
  carrierId: string,
): Promise<{ data: CarrierServiceAreaRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("carrier_service_areas")
    .select("id, carrier_id, country, state, city, service_radius_miles")
    .eq("carrier_id", carrierId)
    .order("country", { ascending: true })
    .order("state", { ascending: true })
    .order("city", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data as CarrierServiceAreaRow[]) ?? [], error: null };
}

export async function addCarrierServiceArea(
  supabase: SupabaseClient,
  userId: string,
  carrierId: string,
  input: ServiceAreaInput,
): Promise<{
  area: CarrierServiceAreaRow | null;
  error: string | null;
}> {
  const validationError = validateServiceAreaInput(input);
  if (validationError) {
    return { area: null, error: validationError };
  }

  const normalized = normalizeServiceAreaInput(input);
  if (!normalized) {
    return { area: null, error: "Invalid service area." };
  }

  const { data: carrier, error: carrierError } = await supabase
    .from("carriers")
    .select("id")
    .eq("id", carrierId)
    .maybeSingle();

  if (carrierError || !carrier) {
    return { area: null, error: "Carrier not found." };
  }

  const existing = await fetchCarrierServiceAreas(supabase, carrierId);
  if (existing.error) {
    return { area: null, error: existing.error };
  }

  const duplicate = findDuplicateServiceArea(existing.data, input);
  if (duplicate) {
    return {
      area: null,
      error: "This service area already exists for this carrier.",
    };
  }

  const { data, error } = await supabase
    .from("carrier_service_areas")
    .insert({
      carrier_id: carrierId,
      country: normalized.country,
      state: normalized.state,
      city: normalized.city,
      service_radius_miles: normalized.service_radius_miles,
    })
    .select("id, carrier_id, country, state, city, service_radius_miles")
    .single();

  if (error || !data) {
    return { area: null, error: error?.message ?? "Unable to add service area." };
  }

  const touch = await touchCarrierUpdatedAt(supabase, carrierId, userId);
  if (touch.error) {
    return { area: null, error: touch.error };
  }

  return { area: data as CarrierServiceAreaRow, error: null };
}

export async function updateCarrierServiceArea(
  supabase: SupabaseClient,
  userId: string,
  carrierId: string,
  areaId: string,
  input: ServiceAreaInput,
): Promise<{
  area: CarrierServiceAreaRow | null;
  error: string | null;
}> {
  const validationError = validateServiceAreaInput(input);
  if (validationError) {
    return { area: null, error: validationError };
  }

  const normalized = normalizeServiceAreaInput(input);
  if (!normalized) {
    return { area: null, error: "Invalid service area." };
  }

  const existing = await fetchCarrierServiceAreas(supabase, carrierId);
  if (existing.error) {
    return { area: null, error: existing.error };
  }

  const areaExists = existing.data.some((area) => area.id === areaId);
  if (!areaExists) {
    return { area: null, error: "Service area not found." };
  }

  const duplicate = findDuplicateServiceArea(existing.data, input, areaId);
  if (duplicate) {
    return {
      area: null,
      error: "This service area already exists for this carrier.",
    };
  }

  const { data, error } = await supabase
    .from("carrier_service_areas")
    .update({
      country: normalized.country,
      state: normalized.state,
      city: normalized.city,
      service_radius_miles: normalized.service_radius_miles,
    })
    .eq("id", areaId)
    .eq("carrier_id", carrierId)
    .select("id, carrier_id, country, state, city, service_radius_miles")
    .single();

  if (error || !data) {
    return { area: null, error: error?.message ?? "Unable to update service area." };
  }

  const touch = await touchCarrierUpdatedAt(supabase, carrierId, userId);
  if (touch.error) {
    return { area: null, error: touch.error };
  }

  return { area: data as CarrierServiceAreaRow, error: null };
}

export async function removeCarrierServiceArea(
  supabase: SupabaseClient,
  userId: string,
  carrierId: string,
  areaId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("carrier_service_areas")
    .delete()
    .eq("id", areaId)
    .eq("carrier_id", carrierId);

  if (error) {
    return { error: error.message };
  }

  return touchCarrierUpdatedAt(supabase, carrierId, userId);
}

import { supabase } from "@/lib/supabaseClient";

export interface Office {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
}

export const UNASSIGNED_OFFICE_LABEL = "Unassigned";
export const ALL_OFFICES_LABEL = "All offices";

export function formatOfficeName(
  office: Pick<Office, "name"> | null | undefined,
): string {
  return office?.name?.trim() || UNASSIGNED_OFFICE_LABEL;
}

export function mapOfficeRow(row: {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean | null;
}): Office {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    isActive: row.is_active ?? true,
  };
}

export async function fetchOffices(): Promise<{
  data: Office[] | null;
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("offices")
    .select("id, name, city, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return { data: null, error };
  }

  return {
    data: (data ?? []).map(mapOfficeRow),
    error: null,
  };
}

export function buildOfficeNameMap(
  offices: Office[],
): Map<string, string> {
  return new Map(offices.map((office) => [office.id, office.name]));
}

export function resolveOfficeName(
  officeId: string | null | undefined,
  officeNameById: Map<string, string>,
): string {
  if (!officeId) {
    return UNASSIGNED_OFFICE_LABEL;
  }

  return officeNameById.get(officeId) ?? UNASSIGNED_OFFICE_LABEL;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeUserRole,
  type UserProfile,
  type UserRole,
} from "@/lib/userProfile";

export type { UserProfile, UserRole };

export async function fetchProfileForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role: normalizeUserRole(data.role),
  };
}

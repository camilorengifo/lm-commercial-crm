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
    .select("id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason")
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
    is_active: data.is_active ?? true,
    is_blocked: data.is_blocked ?? false,
    blocked_at: data.blocked_at ?? null,
    blocked_reason: data.blocked_reason ?? null,
  };
}

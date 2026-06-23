import { supabase } from "@/lib/supabaseClient";

export const USER_ROLES = ["admin", "broker"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

export function normalizeUserRole(value: string | null | undefined): UserRole {
  return value === "admin" ? "admin" : "broker";
}

export function isAdminProfile(profile: UserProfile | null | undefined): boolean {
  return profile?.role === "admin";
}

export function isActiveProfile(profile: UserProfile | null | undefined): boolean {
  return profile?.is_active !== false;
}

export async function fetchUserProfile(
  userId: string,
): Promise<{ data: UserProfile | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    return { data: null, error: null };
  }

  return {
    data: {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: normalizeUserRole(data.role),
      is_active: data.is_active ?? true,
    },
    error: null,
  };
}

export async function fetchAllProfiles(): Promise<{
  data: UserProfile[];
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .order("email", { ascending: true });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (
      (data ?? []) as Array<
        Omit<UserProfile, "role" | "is_active"> & {
          role: string;
          is_active: boolean | null;
        }
      >
    ).map((profile) => ({
      ...profile,
      role: normalizeUserRole(profile.role),
      is_active: profile.is_active ?? true,
    })),
    error: null,
  };
}

export function getProfileDisplayName(profile: UserProfile): string {
  return profile.full_name?.trim() || profile.email?.trim() || profile.id;
}

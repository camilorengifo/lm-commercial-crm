import { supabase } from "@/lib/supabaseClient";
import { verifyAdminAccess } from "@/lib/admin";

export const USER_ROLES = ["admin", "broker"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
}

export function normalizeUserRole(value: string | null | undefined): UserRole {
  return value === "admin" ? "admin" : "broker";
}

export function isAdminProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile || profile.role !== "admin") {
    return false;
  }

  return profile.is_active === true;
}

export function canManageOpportunities(
  profile: UserProfile | null | undefined,
): boolean {
  return profile?.role === "broker" || profile?.role === "admin";
}

export function isActiveProfile(profile: UserProfile | null | undefined): boolean {
  return profile?.is_active !== false;
}

export function isBlockedProfile(profile: UserProfile | null | undefined): boolean {
  return profile?.is_blocked === true;
}

export async function fetchUserProfile(
  userId: string,
): Promise<{ data: UserProfile | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason")
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
      is_blocked: data.is_blocked ?? false,
      blocked_at: data.blocked_at ?? null,
      blocked_reason: data.blocked_reason ?? null,
    },
    error: null,
  };
}

export async function fetchAllProfiles(): Promise<{
  data: UserProfile[];
  error: { message?: string } | null;
}> {
  const access = await verifyAdminAccess();
  if (!access.allowed) {
    return {
      data: [],
      error: { message: "Admin access required." },
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason")
    .order("email", { ascending: true });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (
      (data ?? []) as Array<
        Omit<UserProfile, "role" | "is_active" | "is_blocked"> & {
          role: string;
          is_active: boolean | null;
          is_blocked: boolean | null;
          blocked_at: string | null;
          blocked_reason: string | null;
        }
      >
    ).map((profile) => ({
      ...profile,
      role: normalizeUserRole(profile.role),
      is_active: profile.is_active ?? true,
      is_blocked: profile.is_blocked ?? false,
      blocked_at: profile.blocked_at ?? null,
      blocked_reason: profile.blocked_reason ?? null,
    })),
    error: null,
  };
}

export function getProfileDisplayName(profile: UserProfile): string {
  return profile.full_name?.trim() || profile.email?.trim() || profile.id;
}

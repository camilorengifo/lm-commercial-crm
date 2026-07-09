import type { User } from "@supabase/supabase-js";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

export type AdminAccessResult =
  | {
      allowed: true;
      user: User;
      profile: UserProfile;
    }
  | {
      allowed: false;
      reason: "unauthenticated" | "forbidden";
    };

const ACCESS_CACHE_TTL_MS = 60_000;

let cachedAccess: AdminAccessResult | null = null;
let cachedAccessAt = 0;
let accessInFlight: Promise<AdminAccessResult> | null = null;

async function resolveAdminAccess(): Promise<AdminAccessResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { allowed: false, reason: "unauthenticated" };
  }

  const { data: profile, error } = await fetchUserProfile(user.id);

  if (error || !profile || !isAdminProfile(profile)) {
    return { allowed: false, reason: "forbidden" };
  }

  return {
    allowed: true,
    user,
    profile,
  };
}

/** Clears the short-lived admin access cache (e.g. after role changes). */
export function clearAdminAccessCache(): void {
  cachedAccess = null;
  cachedAccessAt = 0;
  accessInFlight = null;
}

export async function verifyAdminAccess(): Promise<AdminAccessResult> {
  if (cachedAccess && Date.now() - cachedAccessAt < ACCESS_CACHE_TTL_MS) {
    return cachedAccess;
  }

  if (accessInFlight) {
    return accessInFlight;
  }

  accessInFlight = resolveAdminAccess()
    .then((result) => {
      cachedAccess = result;
      cachedAccessAt = Date.now();
      return result;
    })
    .finally(() => {
      accessInFlight = null;
    });

  return accessInFlight;
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

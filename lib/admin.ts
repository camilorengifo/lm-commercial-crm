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

export async function verifyAdminAccess(): Promise<AdminAccessResult> {
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

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

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
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { allowed: false, reason: "unauthenticated" };
  }

  const { data: profile, error } = await fetchUserProfile(session.user.id);

  if (error || !profile || !isAdminProfile(profile) || !profile.is_active) {
    return { allowed: false, reason: "forbidden" };
  }

  return {
    allowed: true,
    user: session.user,
    profile,
  };
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

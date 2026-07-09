import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  fetchProfileForUser,
  type UserProfile,
} from "@/lib/authProfile";
import { isAdminProfile, isSuperAdminProfile } from "@/lib/userProfile";
import {
  createAuthedSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabaseServer";

export interface AdminAuthContext {
  user: User;
  profile: UserProfile;
  supabase: SupabaseClient;
  accessToken: string;
}

export async function requireAdminFromRequest(
  request: Request,
): Promise<
  | { context: AdminAuthContext; error: null; status: null }
  | { context: null; error: string; status: 401 | 403 }
> {
  const { user, supabase, accessToken, error } =
    await getAuthenticatedUser(request);

  if (error || !user || !supabase || !accessToken) {
    return { context: null, error: "Unauthorized", status: 401 };
  }

  const profile = await fetchProfileForUser(supabase, user.id);

  if (!profile || !isAdminProfile(profile)) {
    return { context: null, error: "Forbidden", status: 403 };
  }

  if (!profile.is_active) {
    return { context: null, error: "Forbidden", status: 403 };
  }

  return {
    context: { user, profile, supabase, accessToken },
    error: null,
    status: null,
  };
}

export async function requireSuperAdminFromRequest(
  request: Request,
): Promise<
  | { context: AdminAuthContext; error: null; status: null }
  | { context: null; error: string; status: 401 | 403 }
> {
  const { user, supabase, accessToken, error } =
    await getAuthenticatedUser(request);

  if (error || !user || !supabase || !accessToken) {
    return { context: null, error: "Unauthorized", status: 401 };
  }

  const profile = await fetchProfileForUser(supabase, user.id);

  if (!profile || !isSuperAdminProfile(profile)) {
    return {
      context: null,
      error: "Super administrator access required.",
      status: 403,
    };
  }

  if (!profile.is_active) {
    return { context: null, error: "Forbidden", status: 403 };
  }

  return {
    context: { user, profile, supabase, accessToken },
    error: null,
    status: null,
  };
}

export function createAuthedClientFromToken(accessToken: string): SupabaseClient {
  return createAuthedSupabaseClient(accessToken);
}

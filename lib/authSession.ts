import { supabase } from "@/lib/supabaseClient";
import { fetchUserProfile, type UserProfile } from "@/lib/userProfile";

export interface VerifiedAuthContext {
  userId: string;
  email: string | null;
  profile: UserProfile | null;
  profileMissing: boolean;
  profileIdMatchesAuth: boolean;
  authEmailMatchesProfile: boolean;
}

function emailsMatch(
  authEmail: string | null | undefined,
  profileEmail: string | null | undefined,
): boolean {
  if (!authEmail || !profileEmail) {
    return authEmail === profileEmail;
  }

  return authEmail.trim().toLowerCase() === profileEmail.trim().toLowerCase();
}

export async function getVerifiedAuthContext(): Promise<VerifiedAuthContext | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile } = await fetchUserProfile(user.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    profileMissing: !profile,
    profileIdMatchesAuth: profile ? profile.id === user.id : false,
    authEmailMatchesProfile: profile
      ? emailsMatch(user.email, profile.email)
      : false,
  };
}

export async function signOutAndClearSession(): Promise<void> {
  await supabase.auth.signOut({ scope: "global" });

  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("sb-")) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function redirectToLoginAfterSignOut(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.location.href = "/login";
}

export function createAuthFetchGuard() {
  let generation = 0;

  return {
    next(): number {
      generation += 1;
      return generation;
    },
    isStale(expectedGeneration: number): boolean {
      return expectedGeneration !== generation;
    },
  };
}

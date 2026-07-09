import type { Session } from "@supabase/supabase-js";
import { sessionNeedsPasswordSetup } from "@/lib/invitationSession";
import { supabase } from "@/lib/supabaseClient";
import { fetchUserProfile, isActiveProfile } from "@/lib/userProfile";

export const DEFAULT_AUTHENTICATED_ROUTE = "/";
export const SESSION_CHECK_TIMEOUT_MS = 12_000;
export const POST_LOGIN_NAV_FALLBACK_MS = 2_000;

export type PostLoginProfileResult =
  | { ok: true }
  | { ok: false; message: string; inactive?: boolean };

export interface LoginRouter {
  replace: (href: string) => void;
  refresh: () => void;
}

function logLoginInfo(message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (details) {
    console.info(`[login] ${message}`, details);
  } else {
    console.info(`[login] ${message}`);
  }
}

export function logLoginError(message: string, error?: unknown): void {
  console.error(`[login] ${message}`, error);
}

export function resolvePostLoginRoute(session: Session): string {
  if (sessionNeedsPasswordSetup(session)) {
    return "/set-password";
  }

  return DEFAULT_AUTHENTICATED_ROUTE;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function confirmAuthSession(
  initialSession?: Session | null,
): Promise<Session | null> {
  if (initialSession) {
    logLoginInfo("session confirmed from sign-in response");
    return initialSession;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    logLoginInfo("session confirmed from getSession");
    return session;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  await delay(150);

  const {
    data: { session: retriedSession },
  } = await supabase.auth.getSession();

  if (retriedSession) {
    logLoginInfo("session confirmed after retry");
  }

  return retriedSession;
}

export async function validateProfileForLogin(
  session: Session,
): Promise<PostLoginProfileResult> {
  const { data: profile, error } = await fetchUserProfile(session.user.id);

  if (error) {
    logLoginError("profile fetch failed", error);
    return {
      ok: false,
      message: "Unable to load your profile. Please try again.",
    };
  }

  if (profile && !isActiveProfile(profile)) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message: "Your CRM access is inactive. Please contact an administrator.",
      inactive: true,
    };
  }

  return { ok: true };
}

export async function navigateAfterLogin(
  router: LoginRouter,
  route: string,
): Promise<void> {
  logLoginInfo("redirecting", { route });

  // Always navigate explicitly; callers must not rely on onAuthStateChange.
  router.replace(route);
  router.refresh();

  window.setTimeout(() => {
    if (window.location.pathname === "/login") {
      logLoginInfo("using hard navigation fallback", { route });
      window.location.replace(route);
    }
  }, POST_LOGIN_NAV_FALLBACK_MS);
}

export async function completePostLoginFlow(
  router: LoginRouter,
  session: Session,
): Promise<PostLoginProfileResult> {
  const profileResult = await validateProfileForLogin(session);
  if (!profileResult.ok) {
    return profileResult;
  }

  const route = resolvePostLoginRoute(session);
  await navigateAfterLogin(router, route);
  return { ok: true };
}

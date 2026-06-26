import type { Session } from "@supabase/supabase-js";

export const INVITE_PASSWORD_SETUP_KEY = "needs_password_setup";

export function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!hash.startsWith("#")) {
    return params;
  }

  for (const part of hash.slice(1).split("&")) {
    const [key, value] = part.split("=");
    if (key) {
      params[key] = decodeURIComponent(value ?? "");
    }
  }

  return params;
}

export function sessionNeedsPasswordSetup(session: Session | null): boolean {
  if (!session) {
    return false;
  }

  return session.user.user_metadata?.[INVITE_PASSWORD_SETUP_KEY] === true;
}

export function hashIndicatesInvitation(hash: string): boolean {
  const params = parseHashParams(hash);
  return params.type === "invite" || params.type === "signup";
}

export function hashIndicatesRecovery(hash: string): boolean {
  const params = parseHashParams(hash);
  return params.type === "recovery";
}

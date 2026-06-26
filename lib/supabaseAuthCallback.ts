import type { EmailOtpType } from "@supabase/supabase-js";
import {
  authCallbackIndicatesInvite,
  authCallbackIndicatesRecovery,
} from "@/lib/authRoutes";
import {
  hashIndicatesInvitation,
  hashIndicatesRecovery,
  parseHashParams,
  sessionNeedsPasswordSetup,
} from "@/lib/invitationSession";
import { setPasswordRecoveryPending, isPasswordRecoveryPending } from "@/lib/passwordRecovery";
import { supabase } from "@/lib/supabaseClient";

export type AuthCallbackSessionKind = "recovery" | "invite" | "default";

export type EstablishSessionResult =
  | { status: "session"; kind: AuthCallbackSessionKind }
  | { status: "pending" }
  | { status: "error"; message: string };

function resolveSessionKind(
  search: string,
  hash: string,
): AuthCallbackSessionKind {
  if (
    authCallbackIndicatesInvite(search, hash) ||
    hashIndicatesInvitation(hash)
  ) {
    return "invite";
  }

  if (
    authCallbackIndicatesRecovery(search, hash) ||
    hashIndicatesRecovery(hash)
  ) {
    return "recovery";
  }

  return "default";
}

function markRecoveryIfNeeded(kind: AuthCallbackSessionKind): void {
  if (kind === "recovery") {
    setPasswordRecoveryPending();
  }
}

async function getExistingSessionKind(
  search: string,
  hash: string,
): Promise<EstablishSessionResult | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  if (sessionNeedsPasswordSetup(session)) {
    return { status: "session", kind: "invite" };
  }

  const kind = resolveSessionKind(search, hash);
  markRecoveryIfNeeded(kind);
  return { status: "session", kind };
}

async function establishSessionFromHash(
  search: string,
  hash: string,
): Promise<EstablishSessionResult> {
  const hashParams = parseHashParams(hash);
  const accessToken = hashParams.access_token;
  const refreshToken = hashParams.refresh_token;

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const existing = await getExistingSessionKind(search, hash);
    if (existing) {
      return existing;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return { status: "pending" };
}

export async function establishSessionFromAuthCallback(
  search: string,
  hash: string,
): Promise<EstablishSessionResult> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const existingSession = await getExistingSessionKind(search, hash);
  if (existingSession) {
    return existingSession;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const afterExchangeAttempt = await getExistingSessionKind(search, hash);
      if (afterExchangeAttempt) {
        return afterExchangeAttempt;
      }

      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  if (
    hashIndicatesRecovery(hash) ||
    hashIndicatesInvitation(hash) ||
    parseHashParams(hash).access_token
  ) {
    return establishSessionFromHash(search, hash);
  }

  return { status: "pending" };
}

export function isRecoveryAuthCallback(search: string, hash: string): boolean {
  return (
    authCallbackIndicatesRecovery(search, hash) ||
    hashIndicatesRecovery(hash) ||
    isPasswordRecoveryPending()
  );
}

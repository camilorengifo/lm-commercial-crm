import type { EmailOtpType } from "@supabase/supabase-js";
import {
  authCallbackIndicatesInvite,
  authCallbackIndicatesRecovery,
} from "@/lib/authRoutes";
import { establishInviteSessionViaApi } from "@/lib/inviteAuthClient";
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
  | { status: "error"; message: string; reason?: string; email?: string };

function resolveSessionKind(
  search: string,
  hash: string,
  pathname?: string,
): AuthCallbackSessionKind {
  if (
    authCallbackIndicatesInvite(search, hash, pathname) ||
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
  pathname?: string,
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

  const kind = resolveSessionKind(search, hash, pathname);
  markRecoveryIfNeeded(kind);
  return { status: "session", kind };
}

async function tryServerInviteSession(
  search: string,
  hash: string,
): Promise<EstablishSessionResult | null> {
  const params = new URLSearchParams(search);
  const hashParams = parseHashParams(hash);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") ?? hashParams.type;

  if (!code && !tokenHash) {
    return null;
  }

  const serverResult = await establishInviteSessionViaApi({
    code,
    tokenHash,
    type,
  });

  if (
    serverResult.ok &&
    serverResult.accessToken &&
    serverResult.refreshToken
  ) {
    const { error } = await supabase.auth.setSession({
      access_token: serverResult.accessToken,
      refresh_token: serverResult.refreshToken,
    });

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return { status: "session", kind: "invite" };
  }

  if (!serverResult.ok && serverResult.reason) {
    return {
      status: "error",
      message: serverResult.error ?? "Unable to verify invitation.",
      reason: serverResult.reason,
      email: serverResult.email,
    };
  }

  return null;
}

async function establishSessionFromHash(
  search: string,
  hash: string,
  pathname?: string,
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
      const serverResult = await tryServerInviteSession(search, hash);
      if (serverResult) {
        return serverResult;
      }

      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash, pathname);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const existing = await getExistingSessionKind(search, hash, pathname);
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
  pathname = "/set-password",
): Promise<EstablishSessionResult> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const existingSession = await getExistingSessionKind(search, hash, pathname);
  if (existingSession) {
    return existingSession;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const afterExchangeAttempt = await getExistingSessionKind(
        search,
        hash,
        pathname,
      );
      if (afterExchangeAttempt) {
        return afterExchangeAttempt;
      }

      const inviteKind = resolveSessionKind(search, hash, pathname);
      if (inviteKind === "invite") {
        const serverResult = await tryServerInviteSession(search, hash);
        if (serverResult) {
          return serverResult;
        }
      }

      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash, pathname);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      const inviteKind = resolveSessionKind(search, hash, pathname);
      if (inviteKind === "invite") {
        const serverResult = await tryServerInviteSession(search, hash);
        if (serverResult) {
          return serverResult;
        }
      }

      return { status: "error", message: error.message };
    }

    const kind = resolveSessionKind(search, hash, pathname);
    markRecoveryIfNeeded(kind);
    return { status: "session", kind };
  }

  if (
    hashIndicatesRecovery(hash) ||
    hashIndicatesInvitation(hash) ||
    parseHashParams(hash).access_token
  ) {
    return establishSessionFromHash(search, hash, pathname);
  }

  if (authCallbackIndicatesInvite(search, hash, pathname)) {
    const serverResult = await tryServerInviteSession(search, hash);
    if (serverResult) {
      return serverResult;
    }
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

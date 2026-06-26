import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { INVITE_PASSWORD_SETUP_KEY } from "@/lib/invitationSession";

export interface InviteCallbackParams {
  code?: string;
  tokenHash?: string;
  type?: string;
  hasHashTokens?: boolean;
}

export interface EstablishInviteSessionResult {
  ok: boolean;
  error?: string;
  reason?:
    | "session_created"
    | "already_has_password"
    | "inactive"
    | "not_found"
    | "expired"
    | "invalid"
    | "code_exchange_failed";
  email?: string;
  needsPasswordSetup?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

function createServerAnonAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "implicit",
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function logInviteDebug(details: Record<string, unknown>): void {
  console.info("[invite-auth]", details);
}

function isExpiredAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expired") ||
    normalized.includes("invalid or has expired") ||
    normalized.includes("otp_expired")
  );
}

function normalizeInviteType(type: string | undefined): EmailOtpType | null {
  if (!type) {
    return null;
  }

  if (
    type === "invite" ||
    type === "signup" ||
    type === "recovery" ||
    type === "magiclink" ||
    type === "email"
  ) {
    return type;
  }

  return null;
}

async function lookupUserInviteState(userId: string): Promise<{
  needsPasswordSetup: boolean;
  isActive: boolean;
  email: string | null;
}> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      needsPasswordSetup: false,
      isActive: true,
      email: null,
    };
  }

  const [{ data: authData, error: authError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("profiles").select("email, is_active").eq("id", userId).maybeSingle(),
    ]);

  if (authError) {
    throw authError;
  }

  if (profileError) {
    throw profileError;
  }

  const user = authData.user;
  const needsPasswordSetup =
    user?.user_metadata?.[INVITE_PASSWORD_SETUP_KEY] === true;

  return {
    needsPasswordSetup,
    isActive: profile?.is_active !== false,
    email: profile?.email ?? user?.email ?? null,
  };
}

export async function establishInviteSessionServer(
  params: InviteCallbackParams,
): Promise<EstablishInviteSessionResult> {
  const tokenReceived = Boolean(
    params.tokenHash || params.code || params.hasHashTokens,
  );

  logInviteDebug({
    tokenReceived,
    hasCode: Boolean(params.code),
    hasTokenHash: Boolean(params.tokenHash),
    hasHashTokens: Boolean(params.hasHashTokens),
    type: params.type ?? null,
  });

  const anon = createServerAnonAuthClient();
  const otpType = normalizeInviteType(params.type);

  if (params.tokenHash && otpType) {
    const { data, error } = await anon.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: otpType,
    });

    if (error || !data.session) {
      const expired = error ? isExpiredAuthError(error.message) : false;
      logInviteDebug({
        invitationFound: false,
        expired,
        alreadyAccepted: false,
        email: null,
        verifyError: error?.message ?? "No session returned",
      });

      return {
        ok: false,
        reason: expired ? "expired" : "invalid",
        error: error?.message ?? "Unable to verify invitation.",
      };
    }

    let inviteState;
    try {
      inviteState = await lookupUserInviteState(data.session.user.id);
    } catch (lookupError) {
      logInviteDebug({
        invitationFound: true,
        expired: false,
        alreadyAccepted: false,
        email: data.session.user.email ?? null,
        lookupError:
          lookupError instanceof Error ? lookupError.message : "Lookup failed",
      });

      return {
        ok: false,
        reason: "invalid",
        error: "Unable to validate invitation profile.",
      };
    }

    logInviteDebug({
      invitationFound: true,
      expired: false,
      alreadyAccepted: !inviteState.needsPasswordSetup,
      email: inviteState.email ?? data.session.user.email ?? null,
      inactive: !inviteState.isActive,
    });

    if (!inviteState.isActive) {
      return {
        ok: false,
        reason: "inactive",
        error: "This CRM account is inactive.",
        email: inviteState.email ?? data.session.user.email ?? undefined,
      };
    }

    if (!inviteState.needsPasswordSetup) {
      return {
        ok: false,
        reason: "already_has_password",
        email: inviteState.email ?? data.session.user.email ?? undefined,
        needsPasswordSetup: false,
      };
    }

    return {
      ok: true,
      reason: "session_created",
      email: inviteState.email ?? data.session.user.email ?? undefined,
      needsPasswordSetup: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  if (params.code) {
    const { data, error } = await anon.auth.exchangeCodeForSession(params.code);

    if (error || !data.session) {
      logInviteDebug({
        invitationFound: false,
        expired: error ? isExpiredAuthError(error.message) : false,
        alreadyAccepted: false,
        email: null,
        codeExchangeError: error?.message ?? "No session returned",
      });

      return {
        ok: false,
        reason: "code_exchange_failed",
        error:
          error?.message ??
          "Unable to complete invitation sign-in from this link.",
      };
    }

    let inviteState;
    try {
      inviteState = await lookupUserInviteState(data.session.user.id);
    } catch (lookupError) {
      return {
        ok: false,
        reason: "invalid",
        error: "Unable to validate invitation profile.",
      };
    }

    logInviteDebug({
      invitationFound: true,
      expired: false,
      alreadyAccepted: !inviteState.needsPasswordSetup,
      email: inviteState.email ?? data.session.user.email ?? null,
      inactive: !inviteState.isActive,
    });

    if (!inviteState.isActive) {
      return {
        ok: false,
        reason: "inactive",
        error: "This CRM account is inactive.",
        email: inviteState.email ?? data.session.user.email ?? undefined,
      };
    }

    if (!inviteState.needsPasswordSetup) {
      return {
        ok: false,
        reason: "already_has_password",
        email: inviteState.email ?? data.session.user.email ?? undefined,
        needsPasswordSetup: false,
      };
    }

    return {
      ok: true,
      reason: "session_created",
      email: inviteState.email ?? data.session.user.email ?? undefined,
      needsPasswordSetup: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  logInviteDebug({
    invitationFound: false,
    expired: false,
    alreadyAccepted: false,
    email: null,
    note: "No verifiable token in request",
  });

  return {
    ok: false,
    reason: "not_found",
    error: "Invitation token was not provided.",
  };
}

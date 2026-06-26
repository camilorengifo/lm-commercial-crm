import "server-only";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/appUrl";
import type {
  InvitationValidationReason,
  InvitationValidationResult,
  UserInvitationRow,
} from "@/lib/invitationTypes";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import type { UserRole } from "@/lib/userProfile";

export type {
  InvitationValidationReason,
  InvitationValidationResult,
  UserInvitationRow,
} from "@/lib/invitationTypes";

export const INVITATION_TTL_DAYS = 7;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildInvitationLink(token: string): string {
  return `${getAppBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function logInvitationValidation(details: {
  tokenReceived: boolean;
  reason: InvitationValidationReason;
  email?: string | null;
}): void {
  console.info("[invitation-validate]", {
    tokenReceived: details.tokenReceived,
    invitationFound: details.reason !== "invitation_not_found",
    expired: details.reason === "expired",
    alreadyAccepted: details.reason === "already_accepted",
    email: details.email ?? null,
    reason: details.reason,
  });
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; lastSignInAt: string | null } | null> {
  let page = 1;
  const normalized = normalizeEmail(email);

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const match = users.find(
      (user) => user.email && normalizeEmail(user.email) === normalized,
    );

    if (match) {
      return {
        id: match.id,
        lastSignInAt: match.last_sign_in_at ?? null,
      };
    }

    if (users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

export async function createUserInvitation(input: {
  email: string;
  fullName: string;
  role: UserRole;
  invitedBy?: string;
  existingUser?: boolean;
  authUserId?: string | null;
}): Promise<{ invitation: UserInvitationRow; inviteLink: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  const token = generateInvitationToken();
  const expiresAt = addDays(new Date(), INVITATION_TTL_DAYS).toISOString();

  await admin
    .from("user_invitations")
    .delete()
    .eq("email", email)
    .is("accepted_at", null);

  const { data, error } = await admin
    .from("user_invitations")
    .insert({
      email,
      full_name: fullName,
      role: input.role,
      token,
      invited_by: input.invitedBy ?? null,
      expires_at: expiresAt,
      existing_user: input.existingUser === true,
      auth_user_id: input.authUserId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const inviteLink = buildInvitationLink(token);

  console.info("[invitation] invite-link-generated", {
    email,
    inviteLink,
    expiresAt,
    existingUser: input.existingUser === true,
  });

  return {
    invitation: data as UserInvitationRow,
    inviteLink,
  };
}

export async function validateUserInvitation(
  token: string | null | undefined,
): Promise<InvitationValidationResult> {
  const trimmedToken = token?.trim() ?? "";

  if (!trimmedToken) {
    logInvitationValidation({
      tokenReceived: false,
      reason: "missing_token",
    });

    return { valid: false, reason: "missing_token" };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  let data;
  let error;

  try {
    ({ data, error } = await admin
      .from("user_invitations")
      .select("*")
      .eq("token", trimmedToken)
      .maybeSingle());
  } catch (queryError) {
    console.error("[invitation-validate] query failed", queryError);
    logInvitationValidation({
      tokenReceived: true,
      reason: "invitation_not_found",
    });

    return { valid: false, reason: "invitation_not_found" };
  }

  if (error) {
    console.error("[invitation-validate] database error", error.message);
    logInvitationValidation({
      tokenReceived: true,
      reason: "invitation_not_found",
    });

    return { valid: false, reason: "invitation_not_found" };
  }

  if (!data) {
    logInvitationValidation({
      tokenReceived: true,
      reason: "invitation_not_found",
    });

    return { valid: false, reason: "invitation_not_found" };
  }

  const invitation = data as UserInvitationRow;

  if (invitation.accepted_at) {
    logInvitationValidation({
      tokenReceived: true,
      reason: "already_accepted",
      email: invitation.email,
    });

    return {
      valid: false,
      reason: "already_accepted",
      email: invitation.email,
      fullName: invitation.full_name,
    };
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    logInvitationValidation({
      tokenReceived: true,
      reason: "expired",
      email: invitation.email,
    });

    return {
      valid: false,
      reason: "expired",
      email: invitation.email,
      fullName: invitation.full_name,
    };
  }

  logInvitationValidation({
    tokenReceived: true,
    reason: "valid",
    email: invitation.email,
  });

  return {
    valid: true,
    reason: "valid",
    email: invitation.email,
    fullName: invitation.full_name,
    role: invitation.role,
    existingUser: invitation.existing_user,
    expiresAt: invitation.expires_at,
  };
}

export async function acceptUserInvitation(input: {
  token: string;
  password: string;
}): Promise<{ message: string; email: string }> {
  const validation = await validateUserInvitation(input.token);

  if (!validation.valid) {
    throw new Error(getInvitationErrorMessage(validation.reason));
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const { data: invitation, error: invitationError } = await admin
    .from("user_invitations")
    .select("*")
    .eq("token", input.token.trim())
    .maybeSingle();

  if (invitationError) {
    throw invitationError;
  }

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  const row = invitation as UserInvitationRow;
  const email = normalizeEmail(row.email);
  const password = input.password;

  let userId = row.auth_user_id;

  if (row.existing_user && userId) {
    const { error: updateError } = await admin.auth.admin.updateUserById(
      userId,
      {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: row.full_name,
          role: row.role,
        },
      },
    );

    if (updateError) {
      throw updateError;
    }
  } else {
    const existingAuthUser = await findAuthUserByEmail(admin, email);

    if (existingAuthUser) {
      userId = existingAuthUser.id;

      const { error: updateError } = await admin.auth.admin.updateUserById(
        userId,
        {
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.full_name,
            role: row.role,
          },
        },
      );

      if (updateError) {
        throw updateError;
      }
    } else {
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.full_name,
            role: row.role,
          },
        });

      if (createError) {
        throw createError;
      }

      userId = createdUser.user?.id ?? null;
    }
  }

  if (!userId) {
    throw new Error("Unable to create or update the invited user account.");
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: row.full_name,
      role: row.role,
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw profileError;
  }

  const { error: acceptError } = await admin
    .from("user_invitations")
    .update({ accepted_at: new Date().toISOString(), auth_user_id: userId })
    .eq("id", row.id)
    .is("accepted_at", null);

  if (acceptError) {
    throw acceptError;
  }

  console.info("[invitation] invitation-accepted", {
    email,
    userId,
    invitationId: row.id,
  });

  return {
    message: "Password created successfully.",
    email,
  };
}

export function getInvitationErrorMessage(
  reason: Exclude<InvitationValidationReason, "valid">,
): string {
  switch (reason) {
    case "missing_token":
      return "Invitation token is missing.";
    case "invitation_not_found":
      return "This invitation link is invalid or expired.";
    case "expired":
      return "This invitation link has expired. Please request a new invitation.";
    case "already_accepted":
      return "This invitation has already been used. Please sign in.";
    case "existing_user_has_password":
      return "An account for this email already exists. Please sign in.";
    default:
      return "This invitation link is invalid or expired.";
  }
}

import type { UserRole } from "@/lib/userProfile";

export interface UserInvitationRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  existing_user: boolean;
  auth_user_id: string | null;
  office_id: string | null;
}

export type InvitationValidationReason =
  | "missing_token"
  | "invitation_not_found"
  | "expired"
  | "already_accepted"
  | "existing_user_has_password"
  | "valid";

export interface ValidInvitationPayload {
  valid: true;
  reason: "valid";
  email: string;
  fullName: string;
  role: UserRole;
  existingUser: boolean;
  expiresAt: string;
}

export interface InvalidInvitationPayload {
  valid: false;
  reason: Exclude<InvitationValidationReason, "valid">;
  email?: string;
  fullName?: string;
}

export type InvitationValidationResult =
  | ValidInvitationPayload
  | InvalidInvitationPayload;

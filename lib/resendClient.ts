import "server-only";

import { Resend } from "resend";

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

export function getInvitationFromEmail(): string | null {
  return (
    process.env.INVITATION_FROM_EMAIL?.trim() ||
    process.env.INTERNAL_REMINDER_FROM_EMAIL?.trim() ||
    null
  );
}

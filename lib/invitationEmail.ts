import "server-only";

import { getInvitationFromEmail, getResendClient } from "@/lib/resendClient";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildInvitationEmailContent(input: {
  fullName: string;
  inviteLink: string;
  existingUser: boolean;
}): { subject: string; html: string; text: string } {
  const greetingName = input.fullName.trim() || "there";
  const intro = input.existingUser
    ? "You have been invited to set up access to the Logistics Masters CRM."
    : "You have been invited to join the Logistics Masters CRM.";

  const subject = "Your Logistics Masters CRM invitation";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b;max-width:560px;">
      <p style="margin:0 0 16px;">Hello ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
      <p style="margin:0 0 16px;">Use the button below to create your password and sign in.</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(input.inviteLink)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0;font-size:14px;color:#52525b;word-break:break-all;">${escapeHtml(input.inviteLink)}</p>
    </div>
  `.trim();

  const text = [
    `Hello ${greetingName},`,
    "",
    intro,
    "",
    "Use this link to create your password and sign in:",
    input.inviteLink,
  ].join("\n");

  return { subject, html, text };
}

export async function sendInvitationEmail(input: {
  to: string;
  fullName: string;
  inviteLink: string;
  existingUser: boolean;
}): Promise<{ sent: boolean; error: string | null }> {
  const resend = getResendClient();
  const from = getInvitationFromEmail();
  const content = buildInvitationEmailContent(input);

  if (!resend || !from) {
    console.warn("[invitation] email-not-sent-missing-config", {
      hasResend: Boolean(resend),
      hasFrom: Boolean(from),
      to: input.to,
      inviteLink: input.inviteLink,
    });

    if (process.env.VERCEL === "1") {
      return {
        sent: false,
        error:
          "Invitation email is not configured. Set RESEND_API_KEY and INVITATION_FROM_EMAIL (or INTERNAL_REMINDER_FROM_EMAIL).",
      };
    }

    return { sent: false, error: null };
  }

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (error) {
    return { sent: false, error: error.message };
  }

  console.info("[invitation] invitation-email-sent", {
    to: input.to,
    inviteLink: input.inviteLink,
  });

  return { sent: true, error: null };
}

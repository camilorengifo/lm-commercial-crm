import { Resend } from "resend";
import { generateJsonCompletion } from "@/lib/openai";
import {
  type BrokerReminderData,
  buildRuleBasedSuggestedActions,
} from "@/lib/brokerReminderData";
import { getAppBaseUrl } from "@/lib/appUrl";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listItemsHtml(items: string[]): string {
  if (items.length === 0) {
    return "<p style='margin:0;color:#52525b;'>None</p>";
  }

  return `<ul style="margin:8px 0 0;padding-left:20px;color:#3f3f46;">${items
    .map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

async function buildAiSuggestedActions(
  data: BrokerReminderData,
): Promise<string[] | null> {
  const { data: result, error } = await generateJsonCompletion<{
    suggestedActions: string[];
  }>({
    systemPrompt: `You write concise daily priority bullets for a freight broker's INTERNAL reminder email only.
Use ONLY the CRM data provided. Do not invent accounts, follow-ups, or opportunities.
Do not tell the broker to send automated messages. The broker executes outreach manually.
Return JSON: { "suggestedActions": string[] } with 3 to 5 short actionable bullets.`,
    userPrompt: JSON.stringify(
      {
        brokerName: data.brokerName,
        todayFollowUps: data.todayFollowUps,
        overdueFollowUps: data.overdueFollowUps,
        inactiveCompanies: data.inactiveCompanies,
        newLeadNoActivity: data.newLeadNoActivity,
        inFollowUpNoPendingFollowUp: data.inFollowUpNoPendingFollowUp,
        quotedOpportunities: data.quotedOpportunities,
        newOpportunities: data.newOpportunities,
      },
      null,
      2,
    ),
  });

  if (error || !result?.suggestedActions?.length) {
    return null;
  }

  return result.suggestedActions
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export interface BrokerReminderEmailContent {
  subject: string;
  html: string;
  text: string;
  suggestedActions: string[];
}

export async function buildBrokerReminderEmail(
  data: BrokerReminderData,
): Promise<BrokerReminderEmailContent> {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/`;
  const followUpsUrl = `${baseUrl}/follow-ups`;
  const opportunitiesUrl = `${baseUrl}/opportunities`;

  const aiActions = await buildAiSuggestedActions(data);
  const suggestedActions =
    aiActions ?? buildRuleBasedSuggestedActions(data);

  const todayItems = data.todayFollowUps.map(
    (item) =>
      `${item.title} — ${item.companyName} (due ${item.dueAt})`,
  );

  const overdueItems = data.overdueFollowUps.map(
    (item) =>
      `${item.title} — ${item.companyName} (due ${item.dueAt})`,
  );

  const attentionCompanies = [
    ...data.inactiveCompanies.map(
      (item) =>
        `${item.companyName} — no recent activity (${item.salesStage})`,
    ),
    ...data.newLeadNoActivity.map(
      (item) => `${item.companyName} — new lead, no activity logged`,
    ),
    ...data.inFollowUpNoPendingFollowUp.map(
      (item) =>
        `${item.companyName} — in follow-up with no pending follow-up`,
    ),
  ];

  const opportunityItems = [
    ...data.quotedOpportunities.map(
      (item) =>
        `Quoted: ${item.companyName} — ${item.lane} (updated ${item.updatedAt})`,
    ),
    ...data.newOpportunities.map(
      (item) =>
        `New: ${item.companyName} — ${item.lane} (created/updated ${item.updatedAt})`,
    ),
  ];

  const greetingName = data.brokerName?.trim() || "Broker";

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#18181b;background:#fafafa;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.04em;">
        Logistics Masters AI Commercial Assistant
      </p>
      <h1 style="margin:0 0 12px;font-size:22px;">Your Daily Broker Priorities</h1>
      <p style="margin:0 0 20px;color:#52525b;">Good morning, ${escapeHtml(greetingName)}. Here is what needs your attention today.</p>

      <h2 style="margin:24px 0 8px;font-size:16px;">Suggested Actions</h2>
      ${listItemsHtml(suggestedActions)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Today's Follow-ups</h2>
      ${listItemsHtml(todayItems)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Overdue Follow-ups</h2>
      ${listItemsHtml(overdueItems)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Accounts Needing Attention</h2>
      ${listItemsHtml(attentionCompanies)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Opportunities to Push</h2>
      ${listItemsHtml(opportunityItems)}

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
        <p style="margin:0 0 12px;font-size:14px;color:#52525b;">Open your CRM:</p>
        <p style="margin:0;">
          <a href="${dashboardUrl}" style="color:#18181b;margin-right:12px;">Dashboard</a>
          <a href="${followUpsUrl}" style="color:#18181b;margin-right:12px;">Follow-ups</a>
          <a href="${opportunitiesUrl}" style="color:#18181b;">Opportunities</a>
        </p>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
        Internal broker reminder only. This email was not sent to any customers or contacts.
      </p>
    </div>
  </body>
</html>`.trim();

  const text = [
    "Your Daily Broker Priorities",
    `Good morning, ${greetingName}.`,
    "",
    "Suggested Actions",
    ...suggestedActions.map((item) => `- ${item}`),
    "",
    "Today's Follow-ups",
    ...(todayItems.length ? todayItems.map((item) => `- ${item}`) : ["- None"]),
    "",
    "Overdue Follow-ups",
    ...(overdueItems.length
      ? overdueItems.map((item) => `- ${item}`)
      : ["- None"]),
    "",
    "Accounts Needing Attention",
    ...(attentionCompanies.length
      ? attentionCompanies.map((item) => `- ${item}`)
      : ["- None"]),
    "",
    "Opportunities to Push",
    ...(opportunityItems.length
      ? opportunityItems.map((item) => `- ${item}`)
      : ["- None"]),
    "",
    `Dashboard: ${dashboardUrl}`,
    `Follow-ups: ${followUpsUrl}`,
    `Opportunities: ${opportunitiesUrl}`,
    "",
    "Internal broker reminder only. Not sent to customers or contacts.",
  ].join("\n");

  return {
    subject: "Your Daily Broker Priorities",
    html,
    text,
    suggestedActions,
  };
}

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getReminderFromEmail(): string | null {
  return process.env.INTERNAL_REMINDER_FROM_EMAIL?.trim() || null;
}

export async function sendBrokerReminderEmail(input: {
  to: string;
  content: BrokerReminderEmailContent;
}): Promise<{ error: string | null }> {
  const resend = getResendClient();
  const from = getReminderFromEmail();

  if (!resend) {
    return { error: "RESEND_API_KEY is not configured." };
  }

  if (!from) {
    return { error: "INTERNAL_REMINDER_FROM_EMAIL is not configured." };
  }

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.content.subject,
    html: input.content.html,
    text: input.content.text,
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

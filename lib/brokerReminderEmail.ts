import { Resend } from "resend";
import { generateJsonCompletion } from "@/lib/openaiServer";
import {
  type BrokerReminderData,
  buildRuleBasedSuggestedFocus,
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

function moreItemsNote(hasMore: boolean): string {
  return hasMore
    ? "<p style='margin:8px 0 0;font-size:12px;color:#71717a;'>More items are available in the CRM.</p>"
    : "";
}

function formatFollowUpLine(item: {
  companyName: string;
  title: string;
  dueAt: string;
  contactName: string | null;
  notes: string | null;
  suggestedAction: string;
}): string {
  const parts = [
    `${item.companyName} — ${item.title} (due ${item.dueAt})`,
    item.contactName ? `Contact: ${item.contactName}` : null,
    item.notes ? `Notes: ${item.notes}` : null,
    `Action: ${item.suggestedAction}`,
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatSeasonalLine(item: {
  companyName: string;
  title: string;
  targetDate: string;
  reminderStartDate: string | null;
  seasonalContext: string | null;
  suggestedAction: string;
}): string {
  const parts = [
    `${item.companyName} — ${item.title} (target ${item.targetDate})`,
    item.reminderStartDate
      ? `Start reminding: ${item.reminderStartDate}`
      : null,
    item.seasonalContext ? `Context: ${item.seasonalContext}` : null,
    `Action: ${item.suggestedAction}`,
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatOpenOpportunityLine(item: {
  companyName: string;
  name: string;
  statusLabel: string;
  valueLabel: string | null;
  expectedCloseDate: string | null;
  nextStep: string | null;
  suggestedAction: string;
}): string {
  const parts = [
    `${item.companyName} — ${item.name} (${item.statusLabel})`,
    item.valueLabel ? `Value: ${item.valueLabel}` : null,
    item.expectedCloseDate
      ? `Expected close: ${item.expectedCloseDate}`
      : null,
    item.nextStep ? `Next step: ${item.nextStep}` : null,
    `Action: ${item.suggestedAction}`,
  ].filter(Boolean);

  return parts.join(" | ");
}

async function buildAiSuggestedFocus(
  data: BrokerReminderData,
): Promise<string | null> {
  const { data: result, error } = await generateJsonCompletion<{
    suggestedFocus: string;
  }>({
    systemPrompt: `You write one concise paragraph for a freight broker's INTERNAL daily CRM briefing email.
Use ONLY the CRM data provided. Do not invent accounts, follow-ups, or opportunities.
Do not tell the broker to send automated messages or contact customers automatically.
Return JSON: { "suggestedFocus": string } with a short practical summary (2-3 sentences max).`,
    userPrompt: JSON.stringify(
      {
        brokerName: data.brokerName,
        topPriorities: data.topPriorities,
        overdueFollowUps: data.overdueFollowUps,
        todayFollowUps: data.todayFollowUps,
        seasonalFollowUps: data.seasonalFollowUps,
        openOpportunities: data.openOpportunities,
        priorityAccounts: data.priorityAccounts,
      },
      null,
      2,
    ),
  });

  if (error || !result?.suggestedFocus?.trim()) {
    return null;
  }

  return result.suggestedFocus.trim();
}

export interface BrokerReminderEmailContent {
  subject: string;
  html: string;
  text: string;
  suggestedFocus: string;
}

export async function buildBrokerReminderEmail(
  data: BrokerReminderData,
): Promise<BrokerReminderEmailContent> {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/`;
  const followUpsUrl = `${baseUrl}/follow-ups`;
  const opportunitiesUrl = `${baseUrl}/opportunities`;
  const companiesUrl = `${baseUrl}/companies`;

  const aiFocus = await buildAiSuggestedFocus(data);
  const suggestedFocus =
    aiFocus ?? buildRuleBasedSuggestedFocus(data);

  const topPriorityItems = data.topPriorities.map(
    (item) => `${item.label} — ${item.action}`,
  );

  const overdueItems = data.overdueFollowUps.map(formatFollowUpLine);
  const todayItems = data.todayFollowUps.map(formatFollowUpLine);
  const seasonalItems = data.seasonalFollowUps.map(formatSeasonalLine);
  const opportunityItems = data.openOpportunities.map(formatOpenOpportunityLine);
  const priorityAccountItems = data.priorityAccounts.map(
    (item) =>
      `${item.companyName} (${item.priority}) — ${item.reason}`,
  );

  const greetingName = data.brokerName?.trim() || "Broker";

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#18181b;background:#fafafa;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.04em;">
        Logistics Masters AI Commercial Assistant
      </p>
      <h1 style="margin:0 0 12px;font-size:22px;">Your CRM action plan for today</h1>
      <p style="margin:0 0 8px;color:#52525b;">Good morning, ${escapeHtml(greetingName)}.</p>
      <p style="margin:0 0 20px;color:#52525b;">Here is your CRM action plan for today.</p>

      <h2 style="margin:24px 0 8px;font-size:16px;">Top Priorities</h2>
      ${listItemsHtml(topPriorityItems.length ? topPriorityItems : ["No urgent priorities flagged today."])}

      <h2 style="margin:24px 0 8px;font-size:16px;">Overdue Follow-ups</h2>
      ${listItemsHtml(overdueItems.length ? overdueItems : ["No overdue follow-ups."])}
      ${moreItemsNote(data.hasMoreOverdue)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Today's Follow-ups</h2>
      ${listItemsHtml(todayItems.length ? todayItems : ["No follow-ups due today."])}
      ${moreItemsNote(data.hasMoreToday)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Seasonal / Future Opportunities</h2>
      ${listItemsHtml(
        seasonalItems.length
          ? seasonalItems
          : ["No seasonal opportunities need attention today."],
      )}
      ${moreItemsNote(data.hasMoreSeasonal)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Open Opportunities</h2>
      ${listItemsHtml(
        opportunityItems.length
          ? opportunityItems
          : ["No open opportunities requiring attention."],
      )}
      ${moreItemsNote(data.hasMoreOpenOpportunities)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Priority Working Accounts</h2>
      ${listItemsHtml(
        priorityAccountItems.length
          ? priorityAccountItems
          : ["No priority working accounts flagged today."],
      )}
      ${moreItemsNote(data.hasMorePriorityAccounts)}

      <h2 style="margin:24px 0 8px;font-size:16px;">Suggested Focus</h2>
      <p style="margin:0;color:#3f3f46;">${escapeHtml(suggestedFocus)}</p>

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4e4e7;">
        <p style="margin:0 0 12px;font-size:14px;color:#52525b;">Open your CRM:</p>
        <p style="margin:0;">
          <a href="${dashboardUrl}" style="color:#18181b;margin-right:12px;">Dashboard</a>
          <a href="${followUpsUrl}" style="color:#18181b;margin-right:12px;">Follow-ups</a>
          <a href="${companiesUrl}" style="color:#18181b;margin-right:12px;">Companies</a>
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
    "Your Logistics Masters CRM briefing for today",
    `Good morning, ${greetingName}.`,
    "Here is your CRM action plan for today.",
    "",
    "Top Priorities",
    ...(topPriorityItems.length
      ? topPriorityItems.map((item) => `- ${item}`)
      : ["- No urgent priorities flagged today."]),
    "",
    "Overdue Follow-ups",
    ...(overdueItems.length
      ? overdueItems.map((item) => `- ${item}`)
      : ["- No overdue follow-ups."]),
    ...(data.hasMoreOverdue ? ["- More items are available in the CRM."] : []),
    "",
    "Today's Follow-ups",
    ...(todayItems.length
      ? todayItems.map((item) => `- ${item}`)
      : ["- No follow-ups due today."]),
    ...(data.hasMoreToday ? ["- More items are available in the CRM."] : []),
    "",
    "Seasonal / Future Opportunities",
    ...(seasonalItems.length
      ? seasonalItems.map((item) => `- ${item}`)
      : ["- No seasonal opportunities need attention today."]),
    ...(data.hasMoreSeasonal ? ["- More items are available in the CRM."] : []),
    "",
    "Open Opportunities",
    ...(opportunityItems.length
      ? opportunityItems.map((item) => `- ${item}`)
      : ["- No open opportunities requiring attention."]),
    ...(data.hasMoreOpenOpportunities
      ? ["- More items are available in the CRM."]
      : []),
    "",
    "Priority Working Accounts",
    ...(priorityAccountItems.length
      ? priorityAccountItems.map((item) => `- ${item}`)
      : ["- No priority working accounts flagged today."]),
    ...(data.hasMorePriorityAccounts
      ? ["- More items are available in the CRM."]
      : []),
    "",
    "Suggested Focus",
    suggestedFocus,
    "",
    `Dashboard: ${dashboardUrl}`,
    `Follow-ups: ${followUpsUrl}`,
    `Companies: ${companiesUrl}`,
    `Opportunities: ${opportunitiesUrl}`,
    "",
    "Internal broker reminder only. Not sent to customers or contacts.",
  ].join("\n");

  return {
    subject: "Your Logistics Masters CRM briefing for today",
    html,
    text,
    suggestedFocus,
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

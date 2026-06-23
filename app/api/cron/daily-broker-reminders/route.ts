import { NextResponse } from "next/server";
import {
  buildBrokerReminderData,
  fetchBrokerProfiles,
  getBrokerReminderCounts,
  resolveBrokerEmail,
  type BrokerReminderCounts,
} from "@/lib/brokerReminderData";
import {
  buildBrokerReminderEmail,
  getReminderFromEmail,
  getResendClient,
  sendBrokerReminderEmail,
} from "@/lib/brokerReminderEmail";
import { getCronSecretConfigError, verifyCronSecret } from "@/lib/cronAuth";
import {
  createSupabaseAdminClient,
  getMissingServiceRoleMessage,
} from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface CronRunSummary {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
}

async function logReminderResult(input: {
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  userId: string;
  email: string;
  status: "sent" | "skipped" | "error";
  errorMessage?: string;
  counts?: BrokerReminderCounts;
}) {
  const { error } = await input.supabase.from("broker_reminder_logs").insert({
    user_id: input.userId,
    email: input.email,
    status: input.status,
    error_message: input.errorMessage ?? null,
    counts: input.counts ?? null,
  });

  if (error) {
    console.error(
      `[daily-broker-reminders] Failed to log reminder for ${input.userId}:`,
      error.message,
    );
  }
}

async function runDailyBrokerReminders(): Promise<CronRunSummary> {
  const summary: CronRunSummary = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(getMissingServiceRoleMessage());
  }

  if (!getResendClient()) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!getReminderFromEmail()) {
    throw new Error("INTERNAL_REMINDER_FROM_EMAIL is not configured.");
  }

  const profiles = await fetchBrokerProfiles(supabase);
  console.log(
    `[daily-broker-reminders] Attempting reminders for ${profiles.length} broker profile(s).`,
  );

  for (const profile of profiles) {
    summary.processed += 1;

    try {
      const brokerEmail = await resolveBrokerEmail(supabase, profile);

      if (!brokerEmail) {
        summary.skipped += 1;
        const message = `No broker email found for user ${profile.id}.`;
        summary.errors.push(message);
        console.warn(`[daily-broker-reminders] ${message}`);

        await logReminderResult({
          supabase,
          userId: profile.id,
          email: profile.email ?? "",
          status: "skipped",
          errorMessage: message,
        });
        continue;
      }

      const reminderData = await buildBrokerReminderData(
        supabase,
        profile.id,
        brokerEmail,
        profile.full_name,
      );

      const emailContent = await buildBrokerReminderEmail(reminderData);
      const counts = getBrokerReminderCounts(reminderData);

      const { error: sendError } = await sendBrokerReminderEmail({
        to: brokerEmail,
        content: emailContent,
      });

      if (sendError) {
        summary.skipped += 1;
        summary.errors.push(`${brokerEmail}: ${sendError}`);
        console.error(
          `[daily-broker-reminders] Failed to send to ${brokerEmail}:`,
          sendError,
        );

        await logReminderResult({
          supabase,
          userId: profile.id,
          email: brokerEmail,
          status: "error",
          errorMessage: sendError,
          counts,
        });
        continue;
      }

      summary.sent += 1;
      console.log(`[daily-broker-reminders] Sent reminder to ${brokerEmail}.`);

      await logReminderResult({
        supabase,
        userId: profile.id,
        email: brokerEmail,
        status: "sent",
        counts,
      });
    } catch (error) {
      summary.skipped += 1;
      const message =
        error instanceof Error ? error.message : "Unknown processing error.";
      summary.errors.push(`User ${profile.id}: ${message}`);
      console.error(
        `[daily-broker-reminders] Error processing user ${profile.id}:`,
        message,
      );

      await logReminderResult({
        supabase,
        userId: profile.id,
        email: profile.email ?? "",
        status: "error",
        errorMessage: message,
      });
    }
  }

  console.log(
    `[daily-broker-reminders] Complete. processed=${summary.processed} sent=${summary.sent} skipped=${summary.skipped}`,
  );

  return summary;
}

async function handleCronRequest(request: Request) {
  const configError = getCronSecretConfigError();
  if (configError) {
    console.error(`[daily-broker-reminders] ${configError}`);
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  if (!verifyCronSecret(request)) {
    console.warn("[daily-broker-reminders] Unauthorized cron request rejected.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[daily-broker-reminders] Cron job started.");

  try {
    const summary = await runDailyBrokerReminders();
    console.log(
      `[daily-broker-reminders] Cron job finished. attempted=${summary.processed} sent=${summary.sent} skipped=${summary.skipped} errors=${summary.errors.length}`,
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Daily broker reminder job failed.";

    console.error("[daily-broker-reminders] Job failed:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCronRequest(request);
}

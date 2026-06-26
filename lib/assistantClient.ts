import { supabase } from "@/lib/supabaseClient";
import { AI_CLIENT_ERROR_MESSAGE, sanitizeClientAiError } from "@/lib/aiConstants";
import type { AssistantGenerateResponse } from "@/lib/aiPrompts";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function fetchAssistantActionPlan(brokerUserId?: string) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: "You must be signed in to use AI features." };
  }

  try {
    const response = await fetch("/api/assistant/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        brokerUserId ? { brokerUserId } : {},
      ),
    });

    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      actionPlan?: string;
      priorities?: AssistantGenerateResponse["priorities"];
      whatToDoFirst?: string[];
      whoToContact?: string[];
      crmUpdates?: string[];
      risks?: string[];
      commercialFocus?: string[];
      generatedAt?: string;
    };

    if (!response.ok || payload.success === false) {
      return {
        data: null,
        error: sanitizeClientAiError(payload.error, response.status),
      };
    }

    return {
      data: {
        actionPlan: payload.actionPlan ?? "",
        priorities: payload.priorities ?? [],
        whatToDoFirst: payload.whatToDoFirst ?? [],
        whoToContact: payload.whoToContact ?? [],
        crmUpdates: payload.crmUpdates ?? [],
        risks: payload.risks ?? [],
        commercialFocus: payload.commercialFocus ?? [],
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
      },
      error: null,
    };
  } catch {
    return { data: null, error: AI_CLIENT_ERROR_MESSAGE };
  }
}

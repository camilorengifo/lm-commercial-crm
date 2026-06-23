import { supabase } from "@/lib/supabaseClient";
import type { AccountSummaryResponse } from "@/lib/aiPrompts";
import type { BrokerRecommendationsResponse } from "@/lib/aiPrompts";
import type {
  OutreachDraftResponse,
  OutreachTone,
  OutreachType,
} from "@/lib/aiPrompts";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function postAiRequest<T>(
  path: string,
  body?: Record<string, string | null | undefined>,
): Promise<{ data: T | null; error: string | null }> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return { data: null, error: "You must be signed in to use AI features." };
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? "AI request failed. Please try again.",
    };
  }

  return { data: payload, error: null };
}

export async function fetchBrokerRecommendations() {
  return postAiRequest<{
    recommendations: BrokerRecommendationsResponse;
    generatedAt: string;
  }>("/api/ai/broker-recommendations");
}

export async function fetchAccountSummary(companyId: string) {
  return postAiRequest<{
    summary: AccountSummaryResponse;
    companyName: string;
    generatedAt: string;
  }>("/api/ai/account-summary", { companyId });
}

export async function fetchOutreachDraft(input: {
  companyId: string;
  contactId: string | null;
  outreachType: OutreachType;
  tone: OutreachTone;
  goal: string | null;
}) {
  return postAiRequest<{
    draft: OutreachDraftResponse;
    companyName: string;
    generatedAt: string;
  }>("/api/ai/outreach", {
    companyId: input.companyId,
    contactId: input.contactId,
    outreachType: input.outreachType,
    tone: input.tone,
    goal: input.goal,
  });
}

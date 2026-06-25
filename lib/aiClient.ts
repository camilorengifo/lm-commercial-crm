import { supabase } from "@/lib/supabaseClient";
import {
  AI_CLIENT_ERROR_MESSAGE,
  sanitizeClientAiError,
} from "@/lib/aiConstants";
import type { AccountSummaryResponse } from "@/lib/aiPrompts";
import type { BrokerRecommendationsResponse } from "@/lib/aiPrompts";
import type { BrokerActionPlanResponse } from "@/lib/aiPrompts";
import type { AccountOutreachQuickResponse } from "@/lib/aiPrompts";
import type {
  OutreachDraftResponse,
  OutreachTone,
  OutreachType,
} from "@/lib/aiPrompts";

interface AiApiResponse {
  success?: boolean;
  error?: string;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function postAiRequest<T extends AiApiResponse>(
  path: string,
  body?: Record<string, string | null | undefined>,
): Promise<{ data: T | null; error: string | null }> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return { data: null, error: "You must be signed in to use AI features." };
  }

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json()) as T;

    if (!response.ok || payload.success === false) {
      return {
        data: null,
        error: sanitizeClientAiError(payload.error, response.status),
      };
    }

    return { data: payload, error: null };
  } catch {
    return { data: null, error: AI_CLIENT_ERROR_MESSAGE };
  }
}

export async function fetchBrokerRecommendations() {
  return postAiRequest<{
    success: true;
    recommendations: BrokerRecommendationsResponse;
    generatedAt: string;
  }>("/api/ai/broker-recommendations");
}

export async function fetchBrokerActionPlan() {
  return postAiRequest<{
    success: true;
    plan: BrokerActionPlanResponse;
    generatedAt: string;
  }>("/api/ai/broker-assistant");
}

export async function fetchAccountOutreachDraft(companyId: string) {
  return postAiRequest<{
    success: true;
    draft: AccountOutreachQuickResponse;
    companyName: string;
    generatedAt: string;
  }>("/api/ai/account-outreach", { companyId });
}

export async function fetchAccountSummary(companyId: string) {
  return postAiRequest<{
    success: true;
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
    success: true;
    draft: OutreachDraftResponse;
    message: string;
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

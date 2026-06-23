import { NextResponse } from "next/server";
import { buildBrokerCrmSummary } from "@/lib/aiCrmContext";
import {
  BROKER_SYSTEM_PROMPT,
  buildBrokerUserPrompt,
  normalizeBrokerRecommendations,
  type BrokerRecommendationsResponse,
} from "@/lib/aiPrompts";
import {
  AI_CLIENT_ERROR_MESSAGE,
  generateJsonCompletion,
  logAiRequestStarted,
} from "@/lib/openaiServer";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { user, supabase, error: authError } =
    await getAuthenticatedUser(request);

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logAiRequestStarted("broker-recommendations");

    const summary = await buildBrokerCrmSummary(supabase, user.id);
    const { data, error } = await generateJsonCompletion<BrokerRecommendationsResponse>({
      systemPrompt: BROKER_SYSTEM_PROMPT,
      userPrompt: buildBrokerUserPrompt(summary),
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error ?? AI_CLIENT_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    return NextResponse.json({
      recommendations: normalizeBrokerRecommendations(data),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: AI_CLIENT_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}

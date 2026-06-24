import { buildBrokerCrmSummary } from "@/lib/aiCrmContext";
import {
  BROKER_SYSTEM_PROMPT,
  buildBrokerUserPrompt,
  normalizeBrokerRecommendations,
  type BrokerRecommendationsResponse,
} from "@/lib/aiPrompts";
import {
  aiClientErrorResponse,
  aiGenerationErrorResponse,
  aiSuccessResponse,
  authenticateAiRequest,
  createAiLogContext,
  logAiFailed,
  logAiStart,
  logAiSuccess,
} from "@/lib/aiRouteHelpers";
import { generateJsonCompletion } from "@/lib/openaiServer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase } = auth.context;

  const logContext = createAiLogContext("AI_BROKER_ASSISTANT", user.id);
  logAiStart(logContext);

  try {
    const summary = await buildBrokerCrmSummary(supabase, user.id);
    const { data, error } = await generateJsonCompletion<BrokerRecommendationsResponse>({
      systemPrompt: BROKER_SYSTEM_PROMPT,
      userPrompt: buildBrokerUserPrompt(summary),
      context: "AI_BROKER_ASSISTANT",
    });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    logAiSuccess(logContext, { companyCount: summary.totals.companies });

    return aiSuccessResponse({
      recommendations: normalizeBrokerRecommendations(data),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

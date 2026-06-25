import {
  fetchBrokerAssistantSnapshot,
  summarizePrioritizedAccountsForAi,
} from "@/lib/brokerAssistant";
import {
  BROKER_ACTION_PLAN_SYSTEM_PROMPT,
  buildBrokerActionPlanUserPrompt,
  normalizeBrokerActionPlan,
  type BrokerActionPlanResponse,
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

  const logContext = createAiLogContext("AI_BROKER_ACTION_PLAN", user.id);
  logAiStart(logContext);

  try {
    const snapshot = await fetchBrokerAssistantSnapshot(supabase, user.id, 10);
    const prioritizedAccounts = summarizePrioritizedAccountsForAi(
      snapshot.topAccounts,
    );

    const { data, error } = await generateJsonCompletion<BrokerActionPlanResponse>({
      systemPrompt: BROKER_ACTION_PLAN_SYSTEM_PROMPT,
      userPrompt: buildBrokerActionPlanUserPrompt({
        focus: snapshot.focus,
        prioritizedAccounts,
      }),
      context: "AI_BROKER_ACTION_PLAN",
    });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    logAiSuccess(logContext, {
      accountCount: snapshot.topAccounts.length,
    });

    return aiSuccessResponse({
      plan: normalizeBrokerActionPlan(data),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

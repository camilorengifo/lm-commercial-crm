import {
  fetchBrokerAssistantSnapshot,
  summarizeAssistantContextForAi,
} from "@/lib/brokerAssistant";
import {
  ASSISTANT_GENERATE_SYSTEM_PROMPT,
  buildAssistantGenerateUserPrompt,
  normalizeAssistantGenerateResponse,
  type AssistantGenerateResponse,
} from "@/lib/aiPrompts";
import {
  formatAssistantRunOutput,
  saveAssistantRun,
} from "@/lib/assistantRuns";
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
import { fetchProfileForUser } from "@/lib/authProfile";
import { generateJsonCompletion } from "@/lib/openaiServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;

  let body: { brokerUserId?: string } = {};
  try {
    body = (await request.json()) as { brokerUserId?: string };
  } catch {
    body = {};
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  let dataOwnerUserId = user.id;

  if (isAdmin && body.brokerUserId?.trim()) {
    const brokerUserId = body.brokerUserId.trim();
    if (!UUID_PATTERN.test(brokerUserId)) {
      return aiClientErrorResponse("Invalid broker user ID.", 400);
    }
    dataOwnerUserId = brokerUserId;
  } else if (body.brokerUserId?.trim() && !isAdmin) {
    return aiClientErrorResponse("Forbidden", 403);
  }

  const logContext = createAiLogContext("AI_ASSISTANT_GENERATE", user.id);
  logAiStart(logContext);

  try {
    const snapshot = await fetchBrokerAssistantSnapshot(supabase, dataOwnerUserId, 10);

    if (!snapshot.hasCrmData) {
      return aiClientErrorResponse(
        "Not enough CRM activity yet. Add companies, contacts, follow-ups, and opportunities first.",
        400,
      );
    }

    const context = summarizeAssistantContextForAi(snapshot);
    const inputSummary = JSON.stringify({
      dataOwnerUserId,
      requestedByAdmin: isAdmin && dataOwnerUserId !== user.id,
      focus: snapshot.focus,
      priorityCount: snapshot.todaysPriorities.length,
    });

    const { data, error } = await generateJsonCompletion<AssistantGenerateResponse>({
      systemPrompt: ASSISTANT_GENERATE_SYSTEM_PROMPT,
      userPrompt: buildAssistantGenerateUserPrompt(context),
      context: "AI_ASSISTANT_GENERATE",
    });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    const result = normalizeAssistantGenerateResponse(data);

    if (result.priorities.length === 0 && snapshot.todaysPriorities.length > 0) {
      result.priorities = snapshot.todaysPriorities.map((account) => ({
        companyId: account.companyId,
        companyName: account.companyName,
        priority: account.priority,
        lastContactAt: account.lastActivityAt,
        nextFollowUpAt: account.nextFollowUpAt,
        openOpportunityCount: account.openOpportunityCount,
        reason: account.priorityReasons.join("; "),
        suggestedAction: account.recommendedAction,
      }));
    }

    const generatedAt = new Date().toISOString();

    await saveAssistantRun(supabase, {
      userId: user.id,
      inputSummary,
      outputText: formatAssistantRunOutput(result),
    });

    logAiSuccess(logContext, {
      dataOwnerUserId,
      priorityCount: result.priorities.length,
    });

    return aiSuccessResponse({
      actionPlan: result.actionPlan,
      priorities: result.priorities,
      whatToDoFirst: result.whatToDoFirst,
      whoToContact: result.whoToContact,
      crmUpdates: result.crmUpdates,
      risks: result.risks,
      commercialFocus: result.commercialFocus,
      generatedAt,
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

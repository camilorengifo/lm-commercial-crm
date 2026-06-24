// Assistive only: returns draft text. No sending or automated outreach.
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  OUTREACH_SYSTEM_PROMPT,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  type OutreachDraftResponse,
  type OutreachTone,
  type OutreachType,
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
  resolveCompanyAccess,
} from "@/lib/aiRouteHelpers";
import { generateJsonCompletion } from "@/lib/openaiServer";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OutreachRequestBody {
  companyId?: string;
  contactId?: string | null;
  outreachType?: string;
  tone?: string;
  goal?: string | null;
}

function isOutreachType(value: string): value is OutreachType {
  return (OUTREACH_TYPES as readonly string[]).includes(value);
}

function isOutreachTone(value: string): value is OutreachTone {
  return (OUTREACH_TONES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;

  let body: OutreachRequestBody;

  try {
    body = (await request.json()) as OutreachRequestBody;
  } catch {
    return aiClientErrorResponse("Invalid request body.", 400);
  }

  const companyId = body.companyId?.trim();
  const outreachType = body.outreachType?.trim() ?? "";
  const tone = body.tone?.trim() ?? "";

  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  if (!isOutreachType(outreachType)) {
    return aiClientErrorResponse("A valid outreach type is required.", 400);
  }

  if (!isOutreachTone(tone)) {
    return aiClientErrorResponse("A valid tone is required.", 400);
  }

  const contactId = body.contactId?.trim() || null;
  const goal = body.goal?.trim() || null;

  const logContext = createAiLogContext("AI_OUTREACH", user.id, companyId);
  logAiStart(logContext);

  try {
    const access = await resolveCompanyAccess(
      supabase,
      user.id,
      companyId,
      isAdmin,
    );

    if (!access) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    const context = await buildOutreachCrmContext(
      supabase,
      access.dataOwnerUserId,
      companyId,
      {
        outreachType,
        tone,
        goal,
        contactId,
      },
    );

    if (!context) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    const { data, error } = await generateJsonCompletion<OutreachDraftResponse>({
      systemPrompt: OUTREACH_SYSTEM_PROMPT,
      userPrompt: buildOutreachUserPrompt(context),
      context: "AI_OUTREACH",
    });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    const draft = normalizeOutreachDraft(data);

    logAiSuccess(logContext, { companyName: context.company.name });

    return aiSuccessResponse({
      draft,
      message: draft.fullDraft,
      companyName: context.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

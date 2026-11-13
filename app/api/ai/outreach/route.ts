// Assistive only: returns draft text. No sending or automated outreach.
import { buildCrmFacts } from "@/lib/laneIntelligence";
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  OUTREACH_TONES,
  OUTREACH_SYSTEM_PROMPT,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  OUTREACH_DRAFT_JSON_SCHEMA,
  resolveOutreachType,
  type OutreachDraftResponse,
  type OutreachTone,
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
import { researchFreightMarket, type MarketResearchResult } from "@/lib/marketResearch";
import { generateOutreachJson, getOutreachModel } from "@/lib/openaiServer";
import { OUTREACH_PROMPT_CACHE_KEY, OUTREACH_REASONING_EFFORT } from "@/lib/outreachModel";

export const runtime = "nodejs";
export const maxDuration = 120;

interface OutreachRequestBody {
  companyId?: string;
  contactId?: string | null;
  outreachType?: string;
  tone?: string;
  goal?: string | null;
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
  const outreachType = resolveOutreachType(body.outreachType?.trim() ?? "");
  const tone = body.tone?.trim() ?? "";

  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  if (!outreachType) {
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

    if (context.outreachBlockedReason) {
      return aiClientErrorResponse(context.outreachBlockedReason, 409);
    }

    let marketResearch: MarketResearchResult | null = null;
    if (outreachType === "Technical Follow-up") {
      const location = [context.company.city, context.company.state, context.company.country]
        .filter(Boolean)
        .join(", ");
      marketResearch = await researchFreightMarket({
        companyName: context.company.name,
        location: location || null,
        lanePatterns: context.lanePatterns,
        model: getOutreachModel(),
        reasoningEffort: OUTREACH_REASONING_EFFORT,
      });
    }

    const { data, error } = await generateOutreachJson<OutreachDraftResponse>({
      systemPrompt: OUTREACH_SYSTEM_PROMPT,
      userPrompt: buildOutreachUserPrompt(context, marketResearch),
      schemaName: "outreach_draft",
      schema: OUTREACH_DRAFT_JSON_SCHEMA,
      promptCacheKey: OUTREACH_PROMPT_CACHE_KEY,
      context: "AI_OUTREACH",
      timeoutMs: marketResearch ? 60_000 : 80_000,
    });

    if (error || !data) {
      logAiFailed(logContext, new Error(error ?? "openai_generation_failed"));
      return aiGenerationErrorResponse(error);
    }

    const draft = normalizeOutreachDraft(data, outreachType);
    const intelligence = {
      crmFacts: buildCrmFacts({
        companyName: context.company.name,
        city: context.company.city,
        state: context.company.state,
        country: context.company.country,
        mainPhone: context.company.mainPhone,
        salesStage: context.company.salesStage,
        priority: context.company.priority,
        notes: context.company.generalNotes,
        contactCount: context.contacts.length,
        opportunityCount: context.opportunities.length,
        activityCount: context.commercialTimeline.length,
        followUpCount:
          context.pendingFollowUps.length + context.completedFollowUps.length,
        lanePatterns: context.lanePatterns,
      }),
      lanePatterns: context.lanePatterns,
      marketResearch,
      priorDraftFeedback: context.priorDraftFeedback,
    };

    logAiSuccess(logContext, {
      companyName: context.company.name,
      model: getOutreachModel(),
    });

    return aiSuccessResponse({
      draft,
      intelligence,
      message: draft.fullDraft,
      companyName: context.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

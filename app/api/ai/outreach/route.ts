// Assistive only: returns one email draft. No sending or automated outreach.
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  OUTREACH_SYSTEM_PROMPT,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  OUTREACH_DRAFT_JSON_SCHEMA,
  resolveOutreachTone,
  resolveOutreachType,
  type OutreachDraftResponse,
} from "@/lib/aiPrompts";
import {
  chooseOutreachDraft,
  emailCopyText,
  resolveOutreachLanguage,
  shouldRewriteOutreachDraft,
} from "@/lib/customerEmail";
import { findLaneByKey, rankLanesForOutreach } from "@/lib/laneIntelligence";
import { saveMarketResearchReport } from "@/lib/freightMarket/store";
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
import { researchFreightMarket } from "@/lib/marketResearch";
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
  language?: string;
  enableMarketResearch?: boolean;
  laneKey?: string | null;
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
  const tone = resolveOutreachTone(body.tone?.trim() ?? "");
  const language = resolveOutreachLanguage(body.language?.trim() || "en");

  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  if (!outreachType) {
    return aiClientErrorResponse("A valid outreach type is required.", 400);
  }

  if (!tone) {
    return aiClientErrorResponse("A valid tone is required.", 400);
  }

  if (!language) {
    return aiClientErrorResponse("A valid outreach language is required.", 400);
  }

  const contactId = body.contactId?.trim() || null;
  const goal = body.goal?.trim() || null;
  const laneKey = body.laneKey?.trim() || null;
  const enableMarketResearch = body.enableMarketResearch === true;

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

    const rankedLanes = rankLanesForOutreach(context.lanePatterns);
    const selectedLane = findLaneByKey(rankedLanes, laneKey);
    if (laneKey && !selectedLane) {
      return aiClientErrorResponse("Select a lane recorded on this company.", 400);
    }
    const focusLane = selectedLane ?? rankedLanes[0] ?? null;

    let emailGuidance: string[] = [];
    if (enableMarketResearch) {
      try {
        const location = [context.company.city, context.company.state, context.company.country]
          .filter(Boolean)
          .join(", ");
        const assessment = await researchFreightMarket({
          companyName: context.company.name,
          location: location || null,
          lanePatterns: context.lanePatterns,
          focusLane,
          model: getOutreachModel(),
          reasoningEffort: OUTREACH_REASONING_EFFORT,
        });
        emailGuidance = assessment.emailGuidance;
        await saveMarketResearchReport(supabase, {
          companyId,
          createdBy: user.id,
          assessment,
        });
      } catch (error) {
        logAiFailed(logContext, error, { stage: "market_research" });
        emailGuidance = [];
      }
    }

    const userPrompt = buildOutreachUserPrompt(context, {
      language,
      emailGuidance,
      selectedLane: focusLane
        ? {
            origin: focusLane.origin,
            destination: focusLane.destination,
            equipmentType: focusLane.equipmentType,
            commodities: focusLane.commodities,
          }
        : null,
      laneChosenByBroker: Boolean(selectedLane),
    });
    const generationInput = {
      systemPrompt: OUTREACH_SYSTEM_PROMPT,
      schemaName: "outreach_email",
      schema: OUTREACH_DRAFT_JSON_SCHEMA,
      promptCacheKey: OUTREACH_PROMPT_CACHE_KEY,
      context: "AI_OUTREACH" as const,
    };
    const { data, error } = await generateOutreachJson<OutreachDraftResponse>({
      ...generationInput,
      userPrompt,
      timeoutMs: enableMarketResearch ? 60_000 : 80_000,
    });

    if (error || !data) {
      logAiFailed(logContext, new Error(error ?? "openai_generation_failed"));
      return aiGenerationErrorResponse(error);
    }

    let draft = normalizeOutreachDraft(data, language);
    if (shouldRewriteOutreachDraft(draft)) {
      const retry = await generateOutreachJson<OutreachDraftResponse>({
        ...generationInput,
        userPrompt: `${userPrompt}

The previous draft was too short, too long, or asked for transportation details already retrieved from the CRM. Rewrite one complete email of 70 to 120 words from the Commercial Timeline. Do not ask for equipment, mode, commodity, or a lane. Do not invent a shipping opportunity. clarificationQuestion must be null.`,
        timeoutMs: 45_000,
      });
      if (retry.data) {
        draft = chooseOutreachDraft(draft, normalizeOutreachDraft(retry.data, language));
      }
    }

    logAiSuccess(logContext, {
      companyName: context.company.name,
      model: getOutreachModel(),
      marketResearch: enableMarketResearch,
    });

    return aiSuccessResponse({
      draft,
      message: emailCopyText(draft),
      companyName: context.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

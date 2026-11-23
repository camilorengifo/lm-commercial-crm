// Assistive only: returns draft text. No sending or automated outreach.
import { fetchProfileForUser } from "@/lib/authProfile";
import { buildCrmFacts } from "@/lib/laneIntelligence";
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  OUTREACH_SYSTEM_PROMPT,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  OUTREACH_DRAFT_JSON_SCHEMA,
  isEmailOutreachType,
  resolveOutreachType,
  type OutreachDraftResponse,
} from "@/lib/aiPrompts";
import { resolveOutreachTone } from "@/lib/outreachTone";
import {
  POST_PRESENTATION_OUTREACH_TYPE,
  resolvePostPresentationLanguage,
  selectRecordedFreight,
} from "@/lib/postPresentationEmail";
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
  language?: string | null;
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
  const tone = resolveOutreachTone(body.tone);

  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  if (!outreachType) {
    return aiClientErrorResponse("A valid outreach type is required.", 400);
  }

  if (!tone) {
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

    const postPresentation = outreachType === POST_PRESENTATION_OUTREACH_TYPE;
    const emailType = isEmailOutreachType(outreachType);
    const language = resolvePostPresentationLanguage(body.language);
    let senderName: string | null = null;
    let senderEmail: string | null = user.email?.trim() || null;
    if (emailType) {
      const profile = await fetchProfileForUser(supabase, user.id);
      senderName = profile?.full_name?.trim() || null;
      senderEmail = profile?.email?.trim() || senderEmail;
    }
    const timelineNotes = [...context.commercialTimeline]
      .sort((left, right) => {
        const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : 0;
        const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : 0;
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      })
      .map((item) => ({
        status: item.status,
        title: item.title,
        notes: item.notes,
      }))
      .filter((item) => [item.title, item.notes].some((part) => part?.trim()));
    const draftOptions = {
      language,
      tone,
      contactName: context.selectedContact?.name ?? null,
      senderName,
      senderEmail,
      timelineNotes,
      recordedFreight: selectRecordedFreight(context.opportunities),
      goal,
    };

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
      userPrompt: buildOutreachUserPrompt(context, marketResearch, {
        language,
        sender: emailType ? { name: senderName, email: senderEmail } : undefined,
      }),
      schemaName: "outreach_draft",
      schema: OUTREACH_DRAFT_JSON_SCHEMA,
      promptCacheKey: OUTREACH_PROMPT_CACHE_KEY,
      context: "AI_OUTREACH",
      timeoutMs: marketResearch ? 60_000 : 80_000,
    });

    if (error || !data) {
      logAiFailed(logContext, new Error(error ?? "openai_generation_failed"));
      if (!postPresentation) {
        return aiGenerationErrorResponse(error);
      }
    }

    const draft = normalizeOutreachDraft(postPresentation && (error || !data) ? {} : data, outreachType, draftOptions);
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

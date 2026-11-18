// Internal research only. The assistant does not render this payload.
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import { saveMarketResearchReport } from "@/lib/freightMarket/store";
import { findLaneByKey, rankLanesForOutreach } from "@/lib/laneIntelligence";
import { extractCommercialFacts } from "@/lib/outreachContext";
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
import { getOutreachModel } from "@/lib/openaiServer";
import { OUTREACH_REASONING_EFFORT } from "@/lib/outreachModel";

export const runtime = "nodejs";
export const maxDuration = 90;

interface MarketResearchBody {
  companyId?: string;
  laneKey?: string | null;
}

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);
  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;
  let body: MarketResearchBody;
  try {
    body = (await request.json()) as MarketResearchBody;
  } catch {
    return aiClientErrorResponse("Invalid request body.", 400);
  }

  const companyId = body.companyId?.trim();
  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  const logContext = createAiLogContext("AI_MARKET_RESEARCH", user.id, companyId);
  logAiStart(logContext);

  try {
    const access = await resolveCompanyAccess(supabase, user.id, companyId, isAdmin);
    if (!access) return aiClientErrorResponse("Company not found.", 404);

    const context = await buildOutreachCrmContext(
      supabase,
      access.dataOwnerUserId,
      companyId,
      {
        outreachType: "Technical Follow-up",
        tone: "Natural / Conversational",
        goal: null,
        contactId: null,
      },
    );
    if (!context) return aiClientErrorResponse("Company not found.", 404);

    const ranked = rankLanesForOutreach(context.lanePatterns);
    const selected = findLaneByKey(ranked, body.laneKey);
    const noted = extractCommercialFacts([
      context.company.generalNotes,
      ...context.commercialTimeline.map((item) => `${item.title ?? ""}\n${item.notes ?? ""}`),
    ]);

    const location = [context.company.city, context.company.state, context.company.country]
      .filter(Boolean)
      .join(", ");
    const assessment = await researchFreightMarket({
      companyName: context.company.name,
      location: location || null,
      lanePatterns: context.lanePatterns,
      focusLane: selected ?? (body.laneKey?.trim() ? null : ranked[0] ?? null),
      commodities: noted.commodities,
      equipment: noted.equipment[0] ?? null,
      model: getOutreachModel(),
      reasoningEffort: OUTREACH_REASONING_EFFORT,
    });
    const reportId = await saveMarketResearchReport(supabase, {
      companyId,
      createdBy: user.id,
      assessment,
    });

    logAiSuccess(logContext, { model: getOutreachModel(), stored: Boolean(reportId) });
    return aiSuccessResponse({
      reportId,
      stored: Boolean(reportId),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

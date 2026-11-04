// Stores broker judgment on a draft. Does not send customer communications.
import {
  isOutreachFeedbackRating,
  resolveOutreachType,
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

export const runtime = "nodejs";

interface FeedbackBody {
  companyId?: string;
  outreachType?: string;
  rating?: string;
}

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return aiClientErrorResponse("Invalid request body.", 400);
  }

  const companyId = body.companyId?.trim();
  const outreachType = resolveOutreachType(body.outreachType?.trim() ?? "");
  const rating = body.rating?.trim() ?? "";

  if (!companyId || !outreachType || !isOutreachFeedbackRating(rating)) {
    return aiClientErrorResponse("Company, outreach type, and rating are required.", 400);
  }

  const logContext = createAiLogContext("AI_OUTREACH_FEEDBACK", user.id, companyId);
  logAiStart(logContext);

  try {
    const access = await resolveCompanyAccess(supabase, user.id, companyId, isAdmin);
    if (!access) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    const { error } = await supabase.from("outreach_draft_feedback").insert({
      user_id: user.id,
      company_id: companyId,
      outreach_type: outreachType,
      rating,
    });

    if (error) {
      logAiFailed(logContext, error);
      const missingTable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /outreach_draft_feedback/i.test(error.message);
      return aiClientErrorResponse(
        missingTable
          ? "Draft ratings are not available until the outreach feedback migration is applied."
          : "The rating could not be saved.",
        missingTable ? 503 : 400,
      );
    }

    logAiSuccess(logContext, { companyName: access.companyName });
    return aiSuccessResponse({ saved: true });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

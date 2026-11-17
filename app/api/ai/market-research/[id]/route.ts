// Internal retrieval. The assistant does not call this route.
import { getMarketResearchReport } from "@/lib/freightMarket/store";
import {
  aiClientErrorResponse,
  aiSuccessResponse,
  authenticateAiRequest,
} from "@/lib/aiRouteHelpers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAiRequest(request);
  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { id } = await context.params;
  const reportId = id?.trim();
  if (!reportId) return aiClientErrorResponse("Report ID is required.", 400);

  const report = await getMarketResearchReport(auth.context.supabase, reportId);
  if (!report) return aiClientErrorResponse("Report not found.", 404);

  return aiSuccessResponse({ report });
}

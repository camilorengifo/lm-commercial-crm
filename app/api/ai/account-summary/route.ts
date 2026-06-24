import { buildAccountCrmSummary } from "@/lib/aiCrmContext";
import {
  ACCOUNT_SYSTEM_PROMPT,
  buildAccountUserPrompt,
  normalizeAccountSummary,
  type AccountSummaryResponse,
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

interface AccountSummaryRequestBody {
  companyId?: string;
}

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;

  let body: AccountSummaryRequestBody;

  try {
    body = (await request.json()) as AccountSummaryRequestBody;
  } catch {
    return aiClientErrorResponse("Invalid request body.", 400);
  }

  const companyId = body.companyId?.trim();
  if (!companyId) {
    return aiClientErrorResponse("Company ID is required.", 400);
  }

  const logContext = createAiLogContext("AI_ACCOUNT_SUMMARY", user.id, companyId);
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

    const summary = await buildAccountCrmSummary(
      supabase,
      access.dataOwnerUserId,
      companyId,
    );

    if (!summary) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    const { data, error } = await generateJsonCompletion<AccountSummaryResponse>({
      systemPrompt: ACCOUNT_SYSTEM_PROMPT,
      userPrompt: buildAccountUserPrompt(summary),
      context: "AI_ACCOUNT_SUMMARY",
    });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    const normalizedSummary = normalizeAccountSummary(data);

    logAiSuccess(logContext, { companyName: summary.company.name });

    return aiSuccessResponse({
      summary: normalizedSummary,
      companyName: summary.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

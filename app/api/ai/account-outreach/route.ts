import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
  buildAccountOutreachQuickUserPrompt,
  normalizeAccountOutreachQuick,
  type AccountOutreachQuickResponse,
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

interface AccountOutreachBody {
  companyId?: string;
}

export async function POST(request: Request) {
  const auth = await authenticateAiRequest(request);

  if (auth.error || !auth.context) {
    return aiClientErrorResponse(auth.error ?? "Unauthorized", auth.status ?? 401);
  }

  const { user, supabase, isAdmin } = auth.context;

  let body: AccountOutreachBody = {};
  try {
    body = (await request.json()) as AccountOutreachBody;
  } catch {
    return aiClientErrorResponse("Invalid request body.", 400);
  }

  const companyId = body.companyId?.trim();
  if (!companyId) {
    return aiClientErrorResponse("companyId is required.", 400);
  }

  const logContext = createAiLogContext(
    "AI_ACCOUNT_OUTREACH",
    user.id,
    companyId,
  );
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
        outreachType: "Follow-up Email",
        tone: "Professional",
        goal: "Plan the next commercial touch based on CRM context",
        contactId: null,
      },
    );

    if (!context) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    const { data, error } =
      await generateJsonCompletion<AccountOutreachQuickResponse>({
        systemPrompt: ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
        userPrompt: buildAccountOutreachQuickUserPrompt(context),
        context: "AI_ACCOUNT_OUTREACH",
      });

    if (error || !data) {
      logAiFailed(logContext, new Error("openai_generation_failed"));
      return aiGenerationErrorResponse();
    }

    const draft = normalizeAccountOutreachQuick(data);

    logAiSuccess(logContext, { companyName: context.company.name });

    return aiSuccessResponse({
      draft,
      companyName: context.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logAiFailed(logContext, error);
    return aiGenerationErrorResponse();
  }
}

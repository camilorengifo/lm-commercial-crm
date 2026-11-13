import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
  ACCOUNT_OUTREACH_QUICK_JSON_SCHEMA,
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
import { generateOutreachJson, getOutreachModel } from "@/lib/openaiServer";
import {
  OUTREACH_QUICK_MAX_OUTPUT_TOKEN_CEILING,
  OUTREACH_QUICK_MAX_OUTPUT_TOKENS,
  OUTREACH_QUICK_PROMPT_CACHE_KEY,
} from "@/lib/outreachModel";

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
        outreachType: "Relationship Follow-up",
        tone: "Professional",
        goal: "Plan the next commercial touch based on CRM context",
        contactId: null,
      },
    );

    if (!context) {
      return aiClientErrorResponse("Company not found.", 404);
    }

    if (context.outreachBlockedReason) {
      return aiClientErrorResponse(context.outreachBlockedReason, 409);
    }

    const { data, error } =
      await generateOutreachJson<AccountOutreachQuickResponse>({
        systemPrompt: ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
        userPrompt: buildAccountOutreachQuickUserPrompt(context),
        schemaName: "account_outreach_quick",
        schema: ACCOUNT_OUTREACH_QUICK_JSON_SCHEMA,
        promptCacheKey: OUTREACH_QUICK_PROMPT_CACHE_KEY,
        context: "AI_ACCOUNT_OUTREACH",
        timeoutMs: 45_000,
        maxOutputTokens: OUTREACH_QUICK_MAX_OUTPUT_TOKENS,
        maxOutputTokenCeiling: OUTREACH_QUICK_MAX_OUTPUT_TOKEN_CEILING,
      });

    if (error || !data) {
      logAiFailed(logContext, new Error(error ?? "openai_generation_failed"));
      return aiGenerationErrorResponse(error);
    }

    const draft = normalizeAccountOutreachQuick(data);

    logAiSuccess(logContext, {
      companyName: context.company.name,
      model: getOutreachModel(),
    });

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

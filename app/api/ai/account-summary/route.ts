import { NextResponse } from "next/server";
import { buildAccountCrmSummary } from "@/lib/aiCrmContext";
import {
  ACCOUNT_SYSTEM_PROMPT,
  buildAccountUserPrompt,
  normalizeAccountSummary,
  type AccountSummaryResponse,
} from "@/lib/aiPrompts";
import {
  AI_CLIENT_ERROR_MESSAGE,
  generateJsonCompletion,
  logAiRequestStarted,
} from "@/lib/openaiServer";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

interface AccountSummaryRequestBody {
  companyId?: string;
}

export async function POST(request: Request) {
  const { user, supabase, error: authError } =
    await getAuthenticatedUser(request);

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AccountSummaryRequestBody;

  try {
    body = (await request.json()) as AccountSummaryRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const companyId = body.companyId?.trim();
  if (!companyId) {
    return NextResponse.json(
      { error: "Company ID is required." },
      { status: 400 },
    );
  }

  try {
    logAiRequestStarted("account-summary");

    const summary = await buildAccountCrmSummary(
      supabase,
      user.id,
      companyId,
    );

    if (!summary) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data, error } = await generateJsonCompletion<AccountSummaryResponse>({
      systemPrompt: ACCOUNT_SYSTEM_PROMPT,
      userPrompt: buildAccountUserPrompt(summary),
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error ?? AI_CLIENT_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    return NextResponse.json({
      summary: normalizeAccountSummary(data),
      companyName: summary.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: AI_CLIENT_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}

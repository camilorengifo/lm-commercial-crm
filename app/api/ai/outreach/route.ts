import { NextResponse } from "next/server";
// Assistive only: returns draft text. No sending or automated outreach.
import { buildOutreachCrmContext } from "@/lib/aiCrmContext";
import {
  OUTREACH_SYSTEM_PROMPT,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  type OutreachDraftResponse,
  type OutreachTone,
  type OutreachType,
} from "@/lib/aiPrompts";
import { generateJsonCompletion, AI_CLIENT_ERROR_MESSAGE } from "@/lib/openai";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

interface OutreachRequestBody {
  companyId?: string;
  contactId?: string | null;
  outreachType?: string;
  tone?: string;
  goal?: string | null;
}

function isOutreachType(value: string): value is OutreachType {
  return (OUTREACH_TYPES as readonly string[]).includes(value);
}

function isOutreachTone(value: string): value is OutreachTone {
  return (OUTREACH_TONES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const { user, supabase, error: authError } =
    await getAuthenticatedUser(request);

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: OutreachRequestBody;

  try {
    body = (await request.json()) as OutreachRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const companyId = body.companyId?.trim();
  const outreachType = body.outreachType?.trim() ?? "";
  const tone = body.tone?.trim() ?? "";

  if (!companyId) {
    return NextResponse.json(
      { error: "Company ID is required." },
      { status: 400 },
    );
  }

  if (!isOutreachType(outreachType)) {
    return NextResponse.json(
      { error: "A valid outreach type is required." },
      { status: 400 },
    );
  }

  if (!isOutreachTone(tone)) {
    return NextResponse.json(
      { error: "A valid tone is required." },
      { status: 400 },
    );
  }

  const contactId = body.contactId?.trim() || null;
  const goal = body.goal?.trim() || null;

  try {
    const context = await buildOutreachCrmContext(supabase, user.id, companyId, {
      outreachType,
      tone,
      goal,
      contactId,
    });

    if (!context) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data, error } = await generateJsonCompletion<OutreachDraftResponse>({
      systemPrompt: OUTREACH_SYSTEM_PROMPT,
      userPrompt: buildOutreachUserPrompt(context),
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error ?? AI_CLIENT_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    return NextResponse.json({
      draft: normalizeOutreachDraft(data),
      companyName: context.company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: AI_CLIENT_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}

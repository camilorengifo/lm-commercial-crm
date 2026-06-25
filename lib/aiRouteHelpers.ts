import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fetchProfileForUser } from "@/lib/authProfile";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import { openAiKeyExists } from "@/lib/openaiServer";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { isActiveProfile, isAdminProfile } from "@/lib/userProfile";

export type AiRouteName =
  | "AI_ACCOUNT_SUMMARY"
  | "AI_OUTREACH"
  | "AI_BROKER_ASSISTANT"
  | "AI_BROKER_ACTION_PLAN"
  | "AI_ACCOUNT_OUTREACH";

export interface AiLogContext {
  route: AiRouteName;
  userId: string | null;
  companyId?: string;
  openAiKeyExists: boolean;
}

export interface AuthenticatedAiContext {
  user: User;
  supabase: SupabaseClient;
  isAdmin: boolean;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 200);
  }

  if (typeof error === "string") {
    return error.slice(0, 200);
  }

  return "unknown_error";
}

export function createAiLogContext(
  route: AiRouteName,
  userId: string | null,
  companyId?: string,
): AiLogContext {
  return {
    route,
    userId,
    companyId,
    openAiKeyExists: openAiKeyExists(),
  };
}

export function logAiStart(context: AiLogContext): void {
  console.log(`[${context.route}] start`, context);
}

export function logAiSuccess(
  context: AiLogContext,
  extra?: Record<string, unknown>,
): void {
  console.log(`[${context.route}] success`, { ...context, ...extra });
}

export function logAiFailed(
  context: AiLogContext,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  console.error(`[${context.route}] failed`, {
    ...context,
    ...extra,
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: sanitizeErrorMessage(error),
  });
}

export async function authenticateAiRequest(
  request: Request,
): Promise<
  | { context: AuthenticatedAiContext; error: null; status: null }
  | { context: null; error: string; status: 401 | 403 }
> {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return { context: null, error: "Unauthorized", status: 401 };
  }

  const profile = await fetchProfileForUser(supabase, user.id);

  if (!profile || !isActiveProfile(profile)) {
    return { context: null, error: "Unauthorized", status: 401 };
  }

  return {
    context: {
      user,
      supabase,
      isAdmin: isAdminProfile(profile),
    },
    error: null,
    status: null,
  };
}

export async function resolveCompanyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  isAdmin: boolean,
): Promise<{ dataOwnerUserId: string; companyName: string } | null> {
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, user_id, name")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!company) {
    return null;
  }

  if (!isAdmin && company.user_id !== userId) {
    return null;
  }

  return {
    dataOwnerUserId: company.user_id,
    companyName: company.name,
  };
}

export function aiSuccessResponse<T extends Record<string, unknown>>(
  payload: T,
): NextResponse {
  return NextResponse.json({ success: true, ...payload });
}

export function aiClientErrorResponse(
  error: string,
  status = 400,
): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export function aiGenerationErrorResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: AI_CLIENT_ERROR_MESSAGE },
    { status: 500 },
  );
}

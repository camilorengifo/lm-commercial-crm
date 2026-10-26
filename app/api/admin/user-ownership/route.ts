import { NextResponse } from "next/server";
import { inspectUserCrmOwnershipAdmin } from "@/lib/adminUserManagement";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const inspection = await inspectUserCrmOwnershipAdmin(admin, userId);
    return NextResponse.json(inspection);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to inspect CRM ownership.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

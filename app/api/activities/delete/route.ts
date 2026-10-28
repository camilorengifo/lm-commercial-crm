import { NextResponse } from "next/server";
import { ACTIVITY_DELETED_MESSAGE } from "@/lib/activityEdit";
import { fetchProfileForUser } from "@/lib/authProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function statusForActivityDeleteError(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("not authenticated") || normalized.includes("signed in")) {
    return 401;
  }
  if (
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("blocked")
  ) {
    return 403;
  }
  if (normalized.includes("not found")) {
    return 404;
  }
  return 400;
}

interface DeleteActivityBody {
  activityId?: string;
  companyId?: string;
}

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isBlockedProfile(profile) && !isAdminProfile(profile)) {
    return NextResponse.json(
      {
        error:
          "Your account has been temporarily blocked. Please contact an administrator.",
      },
      { status: 403 },
    );
  }

  let body: DeleteActivityBody;
  try {
    body = (await request.json()) as DeleteActivityBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const activityId = body.activityId?.trim() ?? "";
  const companyId = body.companyId?.trim() ?? "";

  if (!activityId || !isUuid(activityId)) {
    return NextResponse.json({ error: "Invalid activity ID." }, { status: 400 });
  }

  if (!companyId || !isUuid(companyId)) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  // User-scoped client. delete_commercial_activity checks ownership itself
  // because audit cleanup runs as the function owner.
  const { data, error: rpcError } = await supabase.rpc(
    "delete_commercial_activity",
    {
      p_activity_id: activityId,
      p_company_id: companyId,
    },
  );

  if (rpcError) {
    const message = rpcError.message || "Unable to delete this timeline entry.";
    if (
      message.includes("delete_commercial_activity") ||
      message.toLowerCase().includes("schema cache")
    ) {
      return NextResponse.json(
        {
          error:
            "Unable to delete this timeline entry. Apply the latest database migration and try again.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: statusForActivityDeleteError(message) },
    );
  }

  if (data !== "deleted") {
    return NextResponse.json(
      { error: "Unable to delete this timeline entry." },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: ACTIVITY_DELETED_MESSAGE });
}

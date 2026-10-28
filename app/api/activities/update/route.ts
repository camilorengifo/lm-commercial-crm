import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import {
  ACTIVITY_UNCHANGED_MESSAGE,
  ACTIVITY_UPDATED_MESSAGE,
  isKnownActivityType,
  validateActivityEditContent,
} from "@/lib/activityEdit";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function statusForActivityEditError(message: string): number {
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

interface UpdateActivityBody {
  activityId?: string;
  companyId?: string;
  subject?: string | null;
  notes?: string | null;
  activityType?: string;
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

  let body: UpdateActivityBody;
  try {
    body = (await request.json()) as UpdateActivityBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const activityId = body.activityId?.trim() ?? "";
  const companyId = body.companyId?.trim() ?? "";
  const subject = body.subject ?? "";
  const notes = body.notes ?? "";
  const activityType = body.activityType?.trim() ?? "";

  if (!activityId || !isUuid(activityId)) {
    return NextResponse.json({ error: "Invalid activity ID." }, { status: 400 });
  }

  if (!companyId || !isUuid(companyId)) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  if (!isKnownActivityType(activityType)) {
    return NextResponse.json({ error: "Invalid activity type." }, { status: 400 });
  }

  const contentError = validateActivityEditContent({
    subject,
    notes,
    activityType,
  });
  if (contentError) {
    return NextResponse.json({ error: contentError }, { status: 400 });
  }

  // User-scoped client. RLS still applies inside update_commercial_activity.
  const { data, error: rpcError } = await supabase.rpc(
    "update_commercial_activity",
    {
      p_activity_id: activityId,
      p_company_id: companyId,
      p_subject: subject,
      p_notes: notes,
      p_activity_type: activityType,
    },
  );

  if (rpcError) {
    const message = rpcError.message || "Unable to update this activity.";
    if (
      message.includes("update_commercial_activity") ||
      message.toLowerCase().includes("schema cache")
    ) {
      return NextResponse.json(
        {
          error:
            "Unable to update this activity. Apply the latest database migration and try again.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: statusForActivityEditError(message) },
    );
  }

  if (data === "unchanged") {
    return NextResponse.json({ message: ACTIVITY_UNCHANGED_MESSAGE });
  }

  return NextResponse.json({ message: ACTIVITY_UPDATED_MESSAGE });
}

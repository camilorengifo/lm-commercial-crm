import { NextResponse } from "next/server";
import type { RelationshipStatus } from "@/lib/carrierConstants";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function PATCH(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    carrierId?: string;
    privateNotes?: string | null;
    isPreferred?: boolean;
    relationshipStatus?: RelationshipStatus | null;
    lastContactedAt?: string | null;
    preferredContactId?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.carrierId) {
    return NextResponse.json({ error: "Carrier ID is required." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_carriers")
    .select("*")
    .eq("user_id", user.id)
    .eq("carrier_id", body.carrierId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  if (!existing) {
    return NextResponse.json(
      { error: "Add this carrier to My Carriers before updating your relationship." },
      { status: 404 },
    );
  }

  const patch: Record<string, unknown> = {};

  if ("privateNotes" in body) {
    patch.private_notes = body.privateNotes ?? null;
  }
  if ("isPreferred" in body) {
    patch.is_preferred = body.isPreferred ?? false;
  }
  if ("relationshipStatus" in body) {
    patch.relationship_status = body.relationshipStatus ?? null;
  }
  if ("lastContactedAt" in body) {
    patch.last_contacted_at = body.lastContactedAt ?? null;
  }
  if ("preferredContactId" in body) {
    patch.preferred_contact_id = body.preferredContactId ?? null;
  }

  const { error: updateError } = await supabase
    .from("user_carriers")
    .update(patch)
    .eq("user_id", user.id)
    .eq("carrier_id", body.carrierId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Your carrier relationship was updated." });
}

import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import { assertCanSetCarrierStatus } from "@/lib/carrierApi";
import { isCarrierStatus } from "@/lib/carrierConstants";
import { isAdminProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function PATCH(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!isAdminProfile(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { carrierId?: string; status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.carrierId || !body.status || !isCarrierStatus(body.status)) {
    return NextResponse.json(
      { error: "Valid carrier ID and status are required." },
      { status: 400 },
    );
  }

  const statusError = assertCanSetCarrierStatus(profile, body.status);
  if (statusError) {
    return NextResponse.json({ error: statusError }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("carriers")
    .update({
      status: body.status,
      updated_by: user.id,
    })
    .eq("id", body.carrierId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Carrier status updated." });
}

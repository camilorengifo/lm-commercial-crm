import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { carrierId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.carrierId) {
    return NextResponse.json({ error: "Carrier ID is required." }, { status: 400 });
  }

  const { data: carrier, error: carrierError } = await supabase
    .from("carriers")
    .select("id")
    .eq("id", body.carrierId)
    .maybeSingle();

  if (carrierError || !carrier) {
    return NextResponse.json({ error: "Carrier not found." }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_carriers")
    .select("id")
    .eq("user_id", user.id)
    .eq("carrier_id", body.carrierId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  if (!existing) {
    const { error: insertError } = await supabase.from("user_carriers").insert({
      user_id: user.id,
      carrier_id: body.carrierId,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  } else if (existing) {
    // already linked — still success
  }

  return NextResponse.json({
    message: "Carrier added to My Carriers.",
  });
}

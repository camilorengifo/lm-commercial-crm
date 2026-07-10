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

  const { error: deleteError } = await supabase
    .from("user_carriers")
    .delete()
    .eq("user_id", user.id)
    .eq("carrier_id", body.carrierId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({
    message: "Carrier removed from My Carriers.",
  });
}

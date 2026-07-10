import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import { isAdminProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!isAdminProfile(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { sourceCarrierId?: string; targetCarrierId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.sourceCarrierId || !body.targetCarrierId) {
    return NextResponse.json(
      { error: "Source and target carrier IDs are required." },
      { status: 400 },
    );
  }

  const { error: rpcError } = await supabase.rpc("admin_merge_carriers", {
    p_source_carrier_id: body.sourceCarrierId,
    p_target_carrier_id: body.targetCarrierId,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({
    message: "Duplicate carriers merged successfully.",
  });
}

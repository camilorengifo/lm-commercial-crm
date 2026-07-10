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

  let body: { carrierId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.carrierId) {
    return NextResponse.json({ error: "Carrier ID is required." }, { status: 400 });
  }

  const { data, error: rpcError } = await supabase.rpc("admin_archive_carrier", {
    p_carrier_id: body.carrierId,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({
    message: "Carrier archived in the shared Carrier Network.",
    linkedUsers: (data as { linked_users?: number })?.linked_users ?? 0,
  });
}

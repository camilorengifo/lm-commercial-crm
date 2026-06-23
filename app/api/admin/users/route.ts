import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";
import { listAdminUsers } from "@/lib/adminUserManagement";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load users.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

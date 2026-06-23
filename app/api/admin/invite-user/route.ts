import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";
import { inviteAdminUser } from "@/lib/adminUserManagement";
import { USER_ROLES, type UserRole } from "@/lib/userProfile";

interface InviteUserBody {
  email?: string;
  fullName?: string;
  role?: string;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: InviteUserBody;

  try {
    body = (await request.json()) as InviteUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const role = body.role?.trim() ?? "broker";

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }

  if (!fullName) {
    return NextResponse.json(
      { error: "Full name is required." },
      { status: 400 },
    );
  }

  if (!isUserRole(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  try {
    const result = await inviteAdminUser({ email, fullName, role });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to invite user.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

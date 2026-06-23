import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";
import { updateAdminUser } from "@/lib/adminUserManagement";
import { USER_ROLES, type UserRole } from "@/lib/userProfile";

interface UpdateUserBody {
  userId?: string;
  role?: string;
  isActive?: boolean;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: UpdateUserBody;

  try {
    body = (await request.json()) as UpdateUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  if (body.role !== undefined && !isUserRole(body.role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  try {
    const result = await updateAdminUser({
      targetUserId: userId,
      actingAdminId: auth.context.user.id,
      role: body.role,
      isActive: body.isActive,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update user.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

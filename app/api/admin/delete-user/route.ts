import { NextResponse } from "next/server";
import {
  UserDeleteBlockedError,
  deleteAdminUser,
} from "@/lib/adminUserManagement";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";

interface DeleteUserBody {
  userId?: string;
}

export async function DELETE(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: DeleteUserBody;

  try {
    body = (await request.json()) as DeleteUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  try {
    const result = await deleteAdminUser({
      targetUserId: userId,
      actingAdminId: auth.context.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UserDeleteBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to delete user.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

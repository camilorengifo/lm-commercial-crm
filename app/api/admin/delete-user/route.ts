import { NextResponse } from "next/server";
import {
  SuperAdminProtectionError,
  UserDeleteBlockedError,
  removeAdminUser,
  type AdminUserRemoveMode,
} from "@/lib/adminUserManagement";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";

interface DeleteUserBody {
  userId?: string;
  mode?: AdminUserRemoveMode;
  reassignToUserId?: string;
  confirmedForceDelete?: boolean;
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

  const mode = body.mode ?? "delete";
  if (mode !== "delete" && mode !== "deactivate" && mode !== "reassign") {
    return NextResponse.json({ error: "Invalid removal mode." }, { status: 400 });
  }

  try {
    const result = await removeAdminUser({
      targetUserId: userId,
      actingAdminId: auth.context.user.id,
      mode,
      reassignToUserId: body.reassignToUserId,
      confirmedForceDelete: body.confirmedForceDelete === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SuperAdminProtectionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof UserDeleteBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to remove user.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

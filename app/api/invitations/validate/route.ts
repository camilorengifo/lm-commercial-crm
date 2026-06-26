import { NextResponse } from "next/server";
import { validateUserInvitation } from "@/lib/userInvitations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  try {
    const result = await validateUserInvitation(token);

    if (!result.valid) {
      const status =
        result.reason === "missing_token"
          ? 400
          : result.reason === "already_accepted"
            ? 409
            : result.reason === "expired"
              ? 410
              : 404;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to validate invitation.";

    console.error("[invitation-validate] unexpected error", message);

    return NextResponse.json({ valid: false, reason: "invitation_not_found" }, {
      status: 500,
    });
  }
}

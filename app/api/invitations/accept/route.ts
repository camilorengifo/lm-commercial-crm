import { NextResponse } from "next/server";
import { acceptUserInvitation } from "@/lib/userInvitations";

interface AcceptInvitationBody {
  token?: string;
  password?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body: AcceptInvitationBody;

  try {
    body = (await request.json()) as AcceptInvitationBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await acceptUserInvitation({ token, password });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to accept invitation.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

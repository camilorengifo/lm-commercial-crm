import { NextResponse } from "next/server";
import {
  establishInviteSessionServer,
  type InviteCallbackParams,
} from "@/lib/inviteAuthServer";

interface EstablishInviteBody {
  code?: string;
  tokenHash?: string;
  type?: string;
  hasHashTokens?: boolean;
}

export async function POST(request: Request) {
  let body: EstablishInviteBody;

  try {
    body = (await request.json()) as EstablishInviteBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const params: InviteCallbackParams = {
      code: body.code?.trim() || undefined,
      tokenHash: body.tokenHash?.trim() || undefined,
      type: body.type?.trim() || undefined,
      hasHashTokens: body.hasHashTokens === true,
    };

    const result = await establishInviteSessionServer(params);

    if (!result.ok) {
      const status =
        result.reason === "already_has_password"
          ? 409
          : result.reason === "inactive"
            ? 403
            : result.reason === "expired"
              ? 410
              : 400;

      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          error: result.error,
          email: result.email,
          needsPasswordSetup: result.needsPasswordSetup,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      reason: result.reason,
      email: result.email,
      needsPasswordSetup: result.needsPasswordSetup,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to establish invite session.";

    console.error("[invite-auth] unexpected error", message);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export interface EstablishInviteClientResult {
  ok: boolean;
  reason?: string;
  error?: string;
  email?: string;
  needsPasswordSetup?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

export async function establishInviteSessionViaApi(input: {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  hasHashTokens?: boolean;
}): Promise<EstablishInviteClientResult> {
  const response = await fetch("/api/auth/establish-invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: input.code ?? undefined,
      tokenHash: input.tokenHash ?? undefined,
      type: input.type ?? undefined,
      hasHashTokens: input.hasHashTokens === true,
    }),
  });

  const payload = (await response.json()) as EstablishInviteClientResult;

  if (!response.ok) {
    return {
      ok: false,
      reason: payload.reason,
      error: payload.error ?? "Unable to verify invitation.",
      email: payload.email,
      needsPasswordSetup: payload.needsPasswordSetup,
    };
  }

  return payload;
}

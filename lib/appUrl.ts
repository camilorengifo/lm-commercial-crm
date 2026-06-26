const LOCAL_APP_URL = "http://localhost:3000";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/**
 * Resolves the public app base URL for server-side redirects and emails.
 * Priority: NEXT_PUBLIC_APP_URL → VERCEL_URL (production) → localhost (local dev).
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl && !vercelUrl.includes("localhost")) {
    const withProtocol = vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`;

    return normalizeBaseUrl(withProtocol);
  }

  return LOCAL_APP_URL;
}

export function getInviteRedirectUrl(): string {
  return `${getAppBaseUrl()}/set-password`;
}

export function getPasswordResetRedirectUrl(): string {
  return `${getAppBaseUrl()}/reset-password`;
}

export function isLocalAppUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Prevents sending invite emails with a localhost redirect from production.
 */
export function assertSafeInviteRedirect(): void {
  const redirectUrl = getInviteRedirectUrl();

  if (process.env.VERCEL === "1" && isLocalAppUrl(redirectUrl)) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be set to your production URL (e.g. https://lm-commercial-crm.vercel.app) before sending invitations.",
    );
  }
}

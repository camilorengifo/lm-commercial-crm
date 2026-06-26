import {
  hashIndicatesInvitation,
  hashIndicatesRecovery,
  parseHashParams,
} from "@/lib/invitationSession";

export const PUBLIC_AUTH_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/set-password",
] as const;

export type PublicAuthPath = (typeof PUBLIC_AUTH_PATHS)[number];

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname as PublicAuthPath);
}

export function urlHasAuthCallbackParams(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get("code") || params.get("token_hash")) {
    return true;
  }

  const type = params.get("type");
  if (type === "recovery" || type === "invite" || type === "signup") {
    return true;
  }

  const hashParams = parseHashParams(hash);
  return Boolean(hashParams.access_token || hashParams.type);
}

export function authCallbackIndicatesInvite(search: string, hash: string): boolean {
  const type = new URLSearchParams(search).get("type");
  if (type === "invite" || type === "signup") {
    return true;
  }

  return hashIndicatesInvitation(hash);
}

export function authCallbackIndicatesRecovery(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  const type = params.get("type");

  if (type === "recovery" || hashIndicatesRecovery(hash)) {
    return true;
  }

  if (params.get("token_hash") && !authCallbackIndicatesInvite(search, hash)) {
    return type !== "invite" && type !== "signup";
  }

  if (params.get("code") && !authCallbackIndicatesInvite(search, hash)) {
    return type !== "invite" && type !== "signup";
  }

  return false;
}

export function resolveAuthCallbackPath(search: string, hash: string): PublicAuthPath {
  if (authCallbackIndicatesInvite(search, hash)) {
    return "/set-password";
  }

  return "/reset-password";
}

export function buildAuthCallbackRedirect(
  path: PublicAuthPath,
  search: string,
  hash: string,
): string {
  return `${path}${search}${hash}`;
}

export function redirectPathForAuthCallback(
  search: string,
  hash: string,
): PublicAuthPath | null {
  if (!urlHasAuthCallbackParams(search, hash)) {
    return null;
  }

  return resolveAuthCallbackPath(search, hash);
}

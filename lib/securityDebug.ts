export function isSecurityDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_SECURITY_DEBUG === "true";
}

export type SecurityFetchMode = "broker_own_only" | "admin_all" | "broker" | "admin";

export interface SecurityFetchContext {
  page: string;
  fetchMode: SecurityFetchMode;
  authUserId: string;
  authEmail: string | null;
  profileRole?: string | null;
  profileOffice?: string | null;
  filterUserId?: string | null;
  note?: string;
}

export function logSecurityFetchContext(context: SecurityFetchContext): void {
  if (!isSecurityDebugEnabled()) {
    return;
  }

  console.info("[security-debug]", context);
}

export function logBrokerIsolationWarn(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!isSecurityDebugEnabled()) {
    return;
  }

  if (details) {
    console.warn(`[broker-isolation] ${message}`, details);
    return;
  }

  console.warn(`[broker-isolation] ${message}`);
}

export function detectFetchModeFromPath(pathname: string): SecurityFetchMode {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? "admin"
    : "broker";
}

export function decodeSupabaseKeyRole(key: string | undefined): string | null {
  if (!key) {
    return null;
  }

  const parts = key.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(parts[1])) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function warnIfServiceRoleClientKey(key: string | undefined): void {
  if (!isSecurityDebugEnabled()) {
    return;
  }

  const role = decodeSupabaseKeyRole(key);
  if (role === "service_role") {
    console.error(
      "[security-debug] Browser Supabase key has service_role. RLS is bypassed for all queries.",
    );
  }
}

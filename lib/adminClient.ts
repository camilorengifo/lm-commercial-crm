import { supabase } from "@/lib/supabaseClient";
import type {
  AdminUserListItem,
  AdminUserRemovalResult,
} from "@/lib/adminUserManagement";
import type { CrmOwnershipInspection } from "@/lib/crmOwnership";
import type { UserRole } from "@/lib/userProfile";

const REMOVAL_REQUEST_TIMEOUT_MS = 90_000;

export interface AdminRequestResult<T> {
  data: T | null;
  error: string | null;
  status: number;
  timedOut: boolean;
}

export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = REMOVAL_REQUEST_TIMEOUT_MS,
): Promise<AdminRequestResult<T>> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return {
      data: null,
      error: "You must be signed in.",
      status: 401,
      timedOut: false,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    let payload: (T & { error?: string; message?: string }) | null = null;
    try {
      payload = (await response.json()) as T & { error?: string; message?: string };
    } catch {
      return {
        data: null,
        error: response.ok
          ? "The server returned an unreadable response."
          : "The server took too long or returned an unreadable response. Ownership was not checked yet.",
        status: response.status,
        timedOut: !response.ok,
      };
    }

    if (!response.ok) {
      return {
        data: null,
        error: payload.error ?? payload.message ?? "Request failed.",
        status: response.status,
        timedOut: false,
      };
    }

    return { data: payload, error: null, status: response.status, timedOut: false };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      data: null,
      error: aborted
        ? "This is taking longer than expected."
        : "Unable to reach the server.",
      status: aborted ? 408 : 0,
      timedOut: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAdminUsers() {
  return adminRequest<{ users: AdminUserListItem[] }>("/api/admin/users");
}

export async function inviteAdminUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
  officeId?: string | null;
}) {
  return adminRequest<{ message: string }>("/api/admin/invite-user", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminUser(input: {
  userId: string;
  role?: UserRole;
  isActive?: boolean;
  officeId?: string | null;
}) {
  return adminRequest<{ message: string }>("/api/admin/update-user", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminUser(userId: string) {
  return removeAdminUser({
    userId,
    mode: "delete",
  });
}

export async function removeAdminUser(input: {
  userId: string;
  mode: "delete" | "deactivate" | "reassign";
  reassignToUserId?: string;
  confirmedForceDelete?: boolean;
}) {
  return adminRequest<AdminUserRemovalResult>("/api/admin/delete-user", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function fetchUserCrmOwnership(userId: string) {
  return adminRequest<CrmOwnershipInspection>(
    `/api/admin/user-ownership?userId=${encodeURIComponent(userId)}`,
    { method: "GET" },
    20_000,
  );
}

export interface ReassignCompaniesResult {
  message: string;
  reassigned: number;
  skipped: number;
  failed: Array<{ companyId?: string; error?: string }>;
  partial?: boolean;
}

export async function reassignAdminCompanies(input: {
  companyIds: string[];
  newUserId: string;
}) {
  return adminRequest<ReassignCompaniesResult>("/api/admin/reassign-companies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

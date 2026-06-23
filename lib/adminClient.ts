import { supabase } from "@/lib/supabaseClient";
import type { AdminUserListItem } from "@/lib/adminUserManagement";
import type { UserRole } from "@/lib/userProfile";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return {
      data: null,
      error: "You must be signed in.",
      status: 401,
    };
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? payload.message ?? "Request failed.",
      status: response.status,
    };
  }

  return { data: payload, error: null, status: response.status };
}

export async function fetchAdminUsers() {
  return adminRequest<{ users: AdminUserListItem[] }>("/api/admin/users");
}

export async function inviteAdminUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
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
}) {
  return adminRequest<{ message: string }>("/api/admin/update-user", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminUser(userId: string) {
  return adminRequest<{ message: string }>("/api/admin/delete-user", {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });
}

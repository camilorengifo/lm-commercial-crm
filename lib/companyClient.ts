import { supabase } from "@/lib/supabaseClient";
import type { CompanyPriority } from "@/lib/crmConstants";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function companyRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: "You must be signed in." };
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? payload.message ?? "Request failed.",
    };
  }

  return { data: payload, error: null };
}

export interface UpdateCompanyInput {
  companyId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  general_notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

export async function updateCompanyDetails(input: UpdateCompanyInput) {
  return companyRequest<{ message: string }>("/api/companies/update", {
    ...input,
  });
}

export async function archiveCompanies(input: {
  companyIds: string[];
  reason?: string | null;
  confirmText: string;
}) {
  return companyRequest<{
    message: string;
    archived: number;
    blocked?: boolean;
  }>("/api/companies/archive", input);
}

export async function restoreCompanies(companyIds: string[]) {
  return companyRequest<{
    message: string;
    restored: number;
  }>("/api/companies/restore", { companyIds });
}

export async function updateCompanyAccountStatus(input: {
  companyId: string;
  accountStatus: string;
  accountDisposition?: string | null;
  archiveReason?: string | null;
  archiveNotes?: string | null;
}) {
  return companyRequest<{ message: string }>("/api/companies/account-status", {
    companyId: input.companyId,
    accountStatus: input.accountStatus,
    accountDisposition: input.accountDisposition ?? null,
    archiveReason: input.archiveReason ?? null,
    archiveNotes: input.archiveNotes ?? null,
  });
}

export async function bulkUpdateCompanyAccountStatus(input: {
  companyIds: string[];
  accountStatus: string;
  accountDisposition?: string | null;
  archiveReason?: string | null;
  archiveNotes?: string | null;
}) {
  return companyRequest<{
    message: string;
    updated: number;
    failed: number;
    errors?: string[];
  }>("/api/companies/account-status/bulk", {
    companyIds: input.companyIds,
    accountStatus: input.accountStatus,
    accountDisposition: input.accountDisposition ?? null,
    archiveReason: input.archiveReason ?? null,
    archiveNotes: input.archiveNotes ?? null,
  });
}

import { supabase } from "@/lib/supabaseClient";
import type { CompanyPriority } from "@/lib/crmConstants";
import type { CompanyCreateContactForm } from "@/lib/companyCreateContacts";

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
  return companyRequest<{
    message: string;
    company?: {
      account_status: string;
      account_disposition: string | null;
      archived_at: string | null;
      archived_by: string | null;
      archive_reason: string | null;
      archive_notes: string | null;
    };
  }>("/api/companies/account-status", {
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

export const BULK_UPDATE_COMPANY_CHUNK_SIZE = 100;

export async function bulkUpdateCompanyFields(input: {
  companyIds: string[];
  priority?: string | null;
  salesStage?: string | null;
  accountStatus?: string | null;
}) {
  return companyRequest<{
    message: string;
    updated: number;
    failed: number;
    errors?: string[];
  }>("/api/companies/bulk-update", {
    companyIds: input.companyIds,
    priority: input.priority ?? null,
    salesStage: input.salesStage ?? null,
    accountStatus: input.accountStatus ?? null,
  });
}

/** Sends company IDs in chunks to the bulk-update API. */
export async function bulkUpdateCompanyFieldsInBatches(input: {
  companyIds: string[];
  priority?: string | null;
  salesStage?: string | null;
  accountStatus?: string | null;
  chunkSize?: number;
}): Promise<{
  data: {
    message: string;
    updated: number;
    failed: number;
    errors?: string[];
  } | null;
  error: string | null;
}> {
  const chunkSize = input.chunkSize ?? BULK_UPDATE_COMPANY_CHUNK_SIZE;
  const ids = [...new Set(input.companyIds.filter(Boolean))];

  if (ids.length === 0) {
    return { data: null, error: "Select at least one company." };
  }

  if (!input.priority && !input.salesStage && !input.accountStatus) {
    return { data: null, error: "Select at least one field to update." };
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await bulkUpdateCompanyFields({
      companyIds: chunk,
      priority: input.priority,
      salesStage: input.salesStage,
      accountStatus: input.accountStatus,
    });

    if (error || !data) {
      failed += chunk.length;
      errors.push(error ?? `Batch starting at index ${index} failed.`);
      continue;
    }

    updated += data.updated;
    failed += data.failed;
    if (data.errors?.length) {
      errors.push(...data.errors);
    }
  }

  if (updated === 0) {
    return {
      data: null,
      error: errors[0] ?? "Unable to update companies.",
    };
  }

  const message =
    failed === 0
      ? `${updated} compan${updated === 1 ? "y" : "ies"} updated successfully.`
      : `${updated} compan${updated === 1 ? "y" : "ies"} updated successfully. ${failed} could not be updated.`;

  return {
    data: {
      message,
      updated,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    },
    error: null,
  };
}

export interface CreateCompanyInput {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: string;
  general_notes: string | null;
  last_contact_at: string | null;
  contacts?: CompanyCreateContactForm[];
}

export async function createCompany(input: CreateCompanyInput) {
  return companyRequest<{
    message: string;
    companyId: string;
    contactsCreated: number;
    contactsWarning: boolean;
  }>("/api/companies/create", {
    ...input,
  });
}

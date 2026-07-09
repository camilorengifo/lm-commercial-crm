import type { AdminCompaniesOversightFilters } from "@/lib/adminCompanies";
import { getAccessToken } from "@/lib/adminClient";

export const SUPER_ADMIN_DELETE_CONFIRM_TEXT = "DELETE COMPANIES";

export async function superAdminBulkDeleteCompaniesRequest(input: {
  companyIds: string[];
  reason: string;
  confirmText: string;
}): Promise<{
  data: {
    message: string;
    deleted: number;
    requested: number;
    partial?: boolean;
  } | null;
  error: string | null;
  status: number;
}> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return {
      data: null,
      error: "You must be signed in.",
      status: 401,
    };
  }

  const response = await fetch("/api/admin/bulk-delete-companies", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as {
    message?: string;
    deleted?: number;
    requested?: number;
    partial?: boolean;
    error?: string;
  };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? payload.message ?? "Request failed.",
      status: response.status,
    };
  }

  return {
    data: {
      message: payload.message ?? "Companies deleted.",
      deleted: payload.deleted ?? 0,
      requested: payload.requested ?? input.companyIds.length,
      partial: payload.partial,
    },
    error: null,
    status: response.status,
  };
}

export type SuperAdminDeleteScope = "selected" | "filtered";

export function describeSuperAdminDeleteScope(input: {
  scope: SuperAdminDeleteScope;
  selectedCount: number;
  filteredCount: number;
}): string {
  if (input.scope === "filtered") {
    return `all ${input.filteredCount.toLocaleString()} companies matching the current filters`;
  }

  return `${input.selectedCount} selected compan${input.selectedCount === 1 ? "y" : "ies"}`;
}

export type { AdminCompaniesOversightFilters };

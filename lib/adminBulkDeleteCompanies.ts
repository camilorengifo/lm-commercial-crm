import type { SupabaseClient } from "@supabase/supabase-js";

const SUPER_ADMIN_BULK_DELETE_CHUNK_SIZE = 200;

export interface SuperAdminBulkDeleteResult {
  deleted: number;
  failed: Array<{ companyId: string; error: string }>;
  requested: number;
}

export async function superAdminBulkDeleteCompanies(
  supabase: SupabaseClient,
  input: {
    companyIds: string[];
    reason: string;
  },
): Promise<{ result: SuperAdminBulkDeleteResult | null; error: string | null }> {
  const uniqueIds = [...new Set(input.companyIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { result: null, error: "At least one company must be selected." };
  }

  let deleted = 0;
  const failed: Array<{ companyId: string; error: string }> = [];

  for (let index = 0; index < uniqueIds.length; index += SUPER_ADMIN_BULK_DELETE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + SUPER_ADMIN_BULK_DELETE_CHUNK_SIZE);
    const { data, error } = await supabase.rpc("super_admin_bulk_delete_companies", {
      p_company_ids: chunk,
      p_reason: input.reason.trim() || null,
    });

    if (error) {
      return { result: null, error: error.message || "Unable to delete companies." };
    }

    const payload =
      data && typeof data === "object"
        ? (data as {
            deleted?: number;
            failed?: Array<{ companyId?: string; error?: string }>;
          })
        : { deleted: chunk.length };

    deleted += payload.deleted ?? 0;

    if (Array.isArray(payload.failed)) {
      for (const item of payload.failed) {
        if (!item?.companyId) continue;
        failed.push({
          companyId: item.companyId,
          error: item.error ?? "Unable to delete company.",
        });
      }
    }
  }

  return {
    result: {
      deleted,
      failed,
      requested: uniqueIds.length,
    },
    error: null,
  };
}

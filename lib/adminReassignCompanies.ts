import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReassignCompaniesResult {
  reassigned: number;
  skipped: number;
  failed: Array<{ companyId: string; error: string }>;
}

function isMissingBulkRpcError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the function") &&
    normalized.includes("reassign_companies_owner")
  );
}

function parseRpcResult(data: unknown): ReassignCompaniesResult {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};

  const failedRaw = Array.isArray(record.failed) ? record.failed : [];
  const failed = failedRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const companyId =
        typeof entry.companyId === "string" ? entry.companyId : "";
      const error = typeof entry.error === "string" ? entry.error : "Unknown error";
      if (!companyId) return null;
      return { companyId, error };
    })
    .filter((item): item is { companyId: string; error: string } => item !== null);

  return {
    reassigned: typeof record.reassigned === "number" ? record.reassigned : 0,
    skipped: typeof record.skipped === "number" ? record.skipped : 0,
    failed,
  };
}

async function reassignCompaniesOneByOne(
  supabase: SupabaseClient,
  companyIds: string[],
  newUserId: string,
): Promise<{ result: ReassignCompaniesResult; error: string | null }> {
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, user_id")
    .in("id", companyIds);

  if (companiesError) {
    return {
      result: { reassigned: 0, skipped: 0, failed: [] },
      error: companiesError.message,
    };
  }

  const companyById = new Map(
    (companies ?? []).map((company) => [company.id as string, company.user_id as string]),
  );

  let reassigned = 0;
  let skipped = 0;
  const failed: Array<{ companyId: string; error: string }> = [];

  for (const companyId of companyIds) {
    const currentOwnerId = companyById.get(companyId);
    if (!currentOwnerId) {
      failed.push({ companyId, error: "Company not found" });
      continue;
    }

    if (currentOwnerId === newUserId) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.rpc("reassign_company_owner", {
      p_company_id: companyId,
      p_new_user_id: newUserId,
    });

    if (error) {
      failed.push({ companyId, error: error.message });
      continue;
    }

    reassigned += 1;
  }

  return { result: { reassigned, skipped, failed }, error: null };
}

export async function reassignCompaniesOwner(
  supabase: SupabaseClient,
  companyIds: string[],
  newUserId: string,
): Promise<{ result: ReassignCompaniesResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc("reassign_companies_owner", {
    p_company_ids: companyIds,
    p_new_user_id: newUserId,
  });

  if (!error) {
    return { result: parseRpcResult(data), error: null };
  }

  if (isMissingBulkRpcError(error.message)) {
    return reassignCompaniesOneByOne(supabase, companyIds, newUserId);
  }

  return { result: null, error: error.message };
}

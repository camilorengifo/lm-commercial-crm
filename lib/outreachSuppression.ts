import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSuppressionIndex,
  emptySuppressionIndex,
  isCompanyOutreachSuppressed,
  isContactOutreachSuppressed,
  newFollowUpBlockMessage,
  type SuppressionIndex,
} from "@/lib/outreachSuppressionRules";

export interface ActiveOutreachSuppression {
  id: string;
  user_id: string;
  company_id: string;
  contact_id: string | null;
  scope: "contact" | "company";
  reason: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  active: boolean;
}

export async function fetchSuppressionIndex(
  client: SupabaseClient,
  filter?: { userId?: string; companyId?: string },
): Promise<{
  index: SuppressionIndex;
  error: { message?: string; code?: string } | null;
}> {
  let query = client
    .from("outreach_suppressions")
    .select("company_id, contact_id, scope")
    .eq("active", true);

  if (filter?.userId) {
    query = query.eq("user_id", filter.userId);
  }

  if (filter?.companyId) {
    query = query.eq("company_id", filter.companyId);
  }

  const { data, error } = await query;

  if (error) {
    return { index: emptySuppressionIndex(), error };
  }

  return {
    index: buildSuppressionIndex(
      (data ?? []) as Array<{
        company_id: string;
        contact_id: string | null;
        scope: string;
      }>,
    ),
    error: null,
  };
}

export async function fetchActiveSuppressionsForCompany(
  client: SupabaseClient,
  companyId: string,
): Promise<{
  data: ActiveOutreachSuppression[];
  error: { message?: string } | null;
}> {
  const { data, error } = await client
    .from("outreach_suppressions")
    .select(
      "id, user_id, company_id, contact_id, scope, reason, notes, created_at, created_by, active",
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error };
  }

  return {
    data: (data ?? []) as ActiveOutreachSuppression[],
    error: null,
  };
}

export async function followUpCreateBlockMessage(
  client: SupabaseClient,
  input: { companyId: string; contactId?: string | null },
): Promise<{ message: string | null; error: { message?: string } | null }> {
  const { index, error } = await fetchSuppressionIndex(client, {
    companyId: input.companyId,
  });

  if (error) {
    return {
      message: null,
      error: {
        message:
          error.message ??
          "Unable to verify whether follow-ups are suppressed for this account.",
      },
    };
  }

  return {
    message: newFollowUpBlockMessage({
      companySuppressed: isCompanyOutreachSuppressed(index, input.companyId),
      contactSuppressed: isContactOutreachSuppressed(index, input.contactId),
    }),
    error: null,
  };
}

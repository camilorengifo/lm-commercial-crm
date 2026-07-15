import { NextResponse } from "next/server";
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
} from "@/lib/accountStatus";
import { fetchProfileForUser } from "@/lib/authProfile";
import {
  COMPANY_PRIORITIES,
  SALES_STAGES,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BULK_UPDATE_COMPANY_CHUNK_SIZE = 100;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isCompanyPriority(value: string): value is CompanyPriority {
  return (COMPANY_PRIORITIES as readonly string[]).includes(value);
}

function isSalesStage(value: string): value is SalesStage {
  return (SALES_STAGES as readonly string[]).includes(value);
}

function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

interface BulkUpdateCompanyFieldsBody {
  companyIds?: string[];
  priority?: string | null;
  salesStage?: string | null;
  accountStatus?: string | null;
}

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isBlockedProfile(profile) && !isAdminProfile(profile)) {
    return NextResponse.json(
      {
        error:
          "Your account has been temporarily blocked. Please contact an administrator.",
      },
      { status: 403 },
    );
  }

  let body: BulkUpdateCompanyFieldsBody;
  try {
    body = (await request.json()) as BulkUpdateCompanyFieldsBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const companyIds = Array.isArray(body.companyIds)
    ? [...new Set(body.companyIds.map((id) => id?.trim()).filter(Boolean))]
    : [];

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one company." },
      { status: 400 },
    );
  }

  if (companyIds.length > BULK_UPDATE_COMPANY_CHUNK_SIZE) {
    return NextResponse.json(
      {
        error: `You can update up to ${BULK_UPDATE_COMPANY_CHUNK_SIZE} companies per request.`,
      },
      { status: 400 },
    );
  }

  for (const companyId of companyIds) {
    if (!isUuid(companyId)) {
      return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
    }
  }

  const priorityRaw = body.priority?.trim() ?? "";
  const salesStageRaw = body.salesStage?.trim() ?? "";
  const accountStatusRaw = body.accountStatus?.trim().toLowerCase() ?? "";

  const priority =
    priorityRaw && priorityRaw !== "no_change" ? priorityRaw : null;
  const salesStage =
    salesStageRaw && salesStageRaw !== "no_change" ? salesStageRaw : null;
  const accountStatus =
    accountStatusRaw && accountStatusRaw !== "no_change"
      ? accountStatusRaw
      : null;

  if (!priority && !salesStage && !accountStatus) {
    return NextResponse.json(
      { error: "Select at least one field to update." },
      { status: 400 },
    );
  }

  if (priority && !isCompanyPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  }

  if (salesStage && !isSalesStage(salesStage)) {
    return NextResponse.json({ error: "Invalid sales stage." }, { status: 400 });
  }

  if (accountStatus && !isAccountStatus(accountStatus)) {
    return NextResponse.json(
      { error: "Invalid account status." },
      { status: 400 },
    );
  }

  const { data, error: rpcError } = await supabase.rpc(
    "bulk_update_company_fields",
    {
      p_company_ids: companyIds,
      p_priority: priority,
      p_sales_stage: salesStage,
      p_account_status: accountStatus,
    },
  );

  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message || "Unable to update companies." },
      { status: 400 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const updated = Number(row?.updated_count ?? 0);
  const failed = Number(row?.failed_count ?? 0);
  const errors = Array.isArray(row?.error_messages)
    ? (row.error_messages as string[]).filter(Boolean)
    : [];

  if (updated === 0) {
    return NextResponse.json(
      {
        error: errors[0] ?? "Unable to update companies.",
        updated: 0,
        failed: companyIds.length,
        errors,
      },
      { status: 400 },
    );
  }

  const message =
    failed === 0
      ? `${updated} compan${updated === 1 ? "y" : "ies"} updated successfully.`
      : `${updated} compan${updated === 1 ? "y" : "ies"} updated successfully. ${failed} could not be updated.`;

  return NextResponse.json({
    message,
    updated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}

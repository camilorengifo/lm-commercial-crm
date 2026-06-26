import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import {
  ACCOUNT_DISPOSITIONS,
  ACCOUNT_STATUSES,
  BULK_PAUSE_DISPOSITIONS,
  type AccountDisposition,
  type AccountStatus,
} from "@/lib/accountStatus";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BULK_COMPANIES = 100;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

function isAccountDisposition(value: string): value is AccountDisposition {
  return (ACCOUNT_DISPOSITIONS as readonly { value: string }[]).some(
    (option) => option.value === value,
  );
}

function isPauseDisposition(value: string): boolean {
  return (BULK_PAUSE_DISPOSITIONS as readonly { value: string }[]).some(
    (option) => option.value === value,
  );
}

interface BulkUpdateAccountStatusBody {
  companyIds?: string[];
  accountStatus?: string;
  accountDisposition?: string | null;
  archiveReason?: string | null;
  archiveNotes?: string | null;
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

  let body: BulkUpdateAccountStatusBody;
  try {
    body = (await request.json()) as BulkUpdateAccountStatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const accountStatus = body.accountStatus?.trim().toLowerCase() ?? "";
  const companyIds = Array.isArray(body.companyIds)
    ? [...new Set(body.companyIds.map((id) => id?.trim()).filter(Boolean))]
    : [];

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one company." },
      { status: 400 },
    );
  }

  if (companyIds.length > MAX_BULK_COMPANIES) {
    return NextResponse.json(
      { error: `You can update up to ${MAX_BULK_COMPANIES} companies at once.` },
      { status: 400 },
    );
  }

  if (!isAccountStatus(accountStatus)) {
    return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
  }

  for (const companyId of companyIds) {
    if (!isUuid(companyId)) {
      return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
    }
  }

  const disposition = body.accountDisposition?.trim() ?? "";
  if (disposition) {
    const validDisposition =
      accountStatus === "paused"
        ? isPauseDisposition(disposition)
        : isAccountDisposition(disposition);

    if (!validDisposition) {
      return NextResponse.json({ error: "Invalid disposition." }, { status: 400 });
    }
  }

  const archiveReason = body.archiveReason?.trim() || null;
  const archiveNotes = body.archiveNotes?.trim() || null;

  let updated = 0;
  const errors: string[] = [];

  for (const companyId of companyIds) {
    const { error: rpcError } = await supabase.rpc("update_company_account_status", {
      p_company_id: companyId,
      p_account_status: accountStatus,
      p_account_disposition: disposition || null,
      p_archive_reason: archiveReason,
      p_archive_notes: archiveNotes,
    });

    if (rpcError) {
      errors.push(rpcError.message || `Unable to update company ${companyId}.`);
      continue;
    }

    updated += 1;
  }

  if (updated === 0) {
    return NextResponse.json(
      {
        error: errors[0] ?? "Unable to update account status.",
        updated: 0,
        failed: companyIds.length,
        errors,
      },
      { status: 400 },
    );
  }

  const failed = companyIds.length - updated;
  const message =
    failed === 0
      ? `Updated ${updated} account${updated === 1 ? "" : "s"} successfully.`
      : `Updated ${updated} account${updated === 1 ? "" : "s"}. ${failed} could not be updated.`;

  return NextResponse.json({
    message,
    updated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}

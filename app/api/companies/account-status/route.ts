import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import {
  ACCOUNT_DISPOSITIONS,
  ACCOUNT_STATUSES,
  type AccountDisposition,
  type AccountStatus,
} from "@/lib/accountStatus";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

interface UpdateAccountStatusBody {
  companyId?: string;
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

  let body: UpdateAccountStatusBody;
  try {
    body = (await request.json()) as UpdateAccountStatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const companyId = body.companyId?.trim() ?? "";
  const accountStatus = body.accountStatus?.trim().toLowerCase() ?? "";

  if (!companyId || !isUuid(companyId)) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  if (!isAccountStatus(accountStatus)) {
    return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
  }

  const disposition = body.accountDisposition?.trim() ?? "";
  if (disposition && !isAccountDisposition(disposition)) {
    return NextResponse.json({ error: "Invalid disposition." }, { status: 400 });
  }

  const { error: rpcError } = await supabase.rpc("update_company_account_status", {
    p_company_id: companyId,
    p_account_status: accountStatus,
    p_account_disposition: disposition || null,
    p_archive_reason: body.archiveReason?.trim() || null,
    p_archive_notes: body.archiveNotes?.trim() || null,
  });

  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message || "Unable to update account status." },
      { status: 400 },
    );
  }

  return NextResponse.json({ message: "Account status updated successfully." });
}

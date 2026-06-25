import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface ArchiveCompaniesBody {
  companyIds?: string[];
  reason?: string | null;
  confirmText?: string;
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
        blocked: true,
      },
      { status: 403 },
    );
  }

  let body: ArchiveCompaniesBody;
  try {
    body = (await request.json()) as ArchiveCompaniesBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const companyIds = Array.isArray(body.companyIds)
    ? [...new Set(body.companyIds.map((id) => id.trim()).filter(Boolean))]
    : [];

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "At least one company must be selected." },
      { status: 400 },
    );
  }

  if (body.confirmText?.trim().toUpperCase() !== "DELETE") {
    return NextResponse.json(
      { error: 'Type DELETE to confirm archiving this company.' },
      { status: 400 },
    );
  }

  const invalidId = companyIds.find((id) => !isUuid(id));
  if (invalidId) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  const { data, error: rpcError } = await supabase.rpc("archive_companies_safely", {
    p_company_ids: companyIds,
    p_reason: body.reason?.trim() || null,
  });

  if (rpcError) {
    const message = rpcError.message || "Unable to archive company.";
    const blocked =
      message.includes("blocked for security reasons") ||
      message.includes("temporarily blocked");

    return NextResponse.json(
      { error: message, blocked },
      { status: blocked ? 403 : 400 },
    );
  }

  const result =
    data && typeof data === "object"
      ? (data as { archived?: number; failed?: unknown[] })
      : { archived: companyIds.length };

  const archived = result.archived ?? 0;
  const failed = Array.isArray(result.failed) ? result.failed : [];

  if (failed.length > 0 && archived === 0) {
    return NextResponse.json(
      { error: "No companies could be archived.", archived, failed },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message:
      archived === 1
        ? "Company archived successfully."
        : `${archived} companies archived successfully.`,
    archived,
  });
}

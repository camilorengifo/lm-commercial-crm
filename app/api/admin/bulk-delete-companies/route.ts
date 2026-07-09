import { NextResponse } from "next/server";
import { superAdminBulkDeleteCompanies } from "@/lib/adminBulkDeleteCompanies";
import { requireSuperAdminFromRequest } from "@/lib/adminAuthServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPER_ADMIN_DELETE_CONFIRM_TEXT = "DELETE COMPANIES";

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface BulkDeleteCompaniesBody {
  companyIds?: string[];
  reason?: string | null;
  confirmText?: string;
}

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: BulkDeleteCompaniesBody;
  try {
    body = (await request.json()) as BulkDeleteCompaniesBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.confirmText?.trim() !== SUPER_ADMIN_DELETE_CONFIRM_TEXT) {
    return NextResponse.json(
      {
        error: `Type ${SUPER_ADMIN_DELETE_CONFIRM_TEXT} to confirm deleting companies.`,
      },
      { status: 400 },
    );
  }

  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json(
      { error: "A deletion reason is required." },
      { status: 400 },
    );
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

  const invalidId = companyIds.find((companyId) => !isUuid(companyId));
  if (invalidId) {
    return NextResponse.json({ error: "One or more company IDs are invalid." }, { status: 400 });
  }

  const { result, error } = await superAdminBulkDeleteCompanies(
    auth.context.supabase,
    {
      companyIds,
      reason,
    },
  );

  if (error || !result) {
    return NextResponse.json(
      { error: error ?? "Unable to delete companies." },
      { status: 400 },
    );
  }

  if (result.failed.length > 0 && result.deleted === 0) {
    return NextResponse.json(
      {
        error: "No companies could be deleted.",
        deleted: result.deleted,
        failed: result.failed,
      },
      { status: 400 },
    );
  }

  console.info("[super_admin_bulk_delete]", {
    performedBy: auth.context.user.id,
    email: auth.context.profile.email,
    requested: result.requested,
    deleted: result.deleted,
    failedCount: result.failed.length,
    reason,
  });

  return NextResponse.json({
    message:
      result.deleted === 1
        ? "1 company deleted successfully."
        : `${result.deleted} companies deleted successfully.`,
    deleted: result.deleted,
    failed: result.failed,
    requested: result.requested,
    partial: result.failed.length > 0,
  });
}

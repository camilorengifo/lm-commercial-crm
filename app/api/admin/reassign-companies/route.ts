import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";
import { reassignCompaniesOwner } from "@/lib/adminReassignCompanies";

interface ReassignCompaniesBody {
  companyIds?: string[];
  newUserId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ReassignCompaniesBody;

  try {
    body = (await request.json()) as ReassignCompaniesBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const companyIds = Array.isArray(body.companyIds)
    ? [...new Set(body.companyIds.map((id) => id.trim()).filter(Boolean))]
    : [];
  const newUserId = body.newUserId?.trim() ?? "";

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "At least one company must be selected." },
      { status: 400 },
    );
  }

  if (!newUserId) {
    return NextResponse.json(
      { error: "Target owner is required." },
      { status: 400 },
    );
  }

  if (!isUuid(newUserId)) {
    return NextResponse.json(
      { error: "Invalid target owner ID." },
      { status: 400 },
    );
  }

  const invalidCompanyId = companyIds.find((companyId) => !isUuid(companyId));
  if (invalidCompanyId) {
    return NextResponse.json(
      { error: "One or more company IDs are invalid." },
      { status: 400 },
    );
  }

  const { result, error } = await reassignCompaniesOwner(
    auth.context.supabase,
    companyIds,
    newUserId,
  );

  if (error || !result) {
    return NextResponse.json(
      { error: error || "Unable to reassign companies." },
      { status: 400 },
    );
  }

  const { reassigned, skipped, failed } = result;

  if (failed.length > 0 && reassigned === 0 && skipped === 0) {
    return NextResponse.json(
      {
        error: "No companies could be reassigned.",
        reassigned,
        skipped,
        failed,
      },
      { status: 400 },
    );
  }

  if (failed.length > 0) {
    return NextResponse.json({
      message: `${reassigned} compan${reassigned === 1 ? "y" : "ies"} reassigned. ${failed.length} failed.`,
      reassigned,
      skipped,
      failed,
      partial: true,
    });
  }

  if (reassigned === 0 && skipped > 0) {
    return NextResponse.json({
      message: "Selected companies already belong to the target broker.",
      reassigned,
      skipped,
      failed: [],
    });
  }

  return NextResponse.json({
    message: "Companies reassigned successfully.",
    reassigned,
    skipped,
    failed: [],
  });
}

import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminAuthServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface RestoreCompaniesBody {
  companyIds?: string[];
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.context) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RestoreCompaniesBody;
  try {
    body = (await request.json()) as RestoreCompaniesBody;
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

  const invalidId = companyIds.find((id) => !isUuid(id));
  if (invalidId) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  const { data, error } = await auth.context.supabase.rpc("restore_companies", {
    p_company_ids: companyIds,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Unable to restore companies." },
      { status: 400 },
    );
  }

  const result =
    data && typeof data === "object"
      ? (data as { restored?: number; failed?: unknown[] })
      : { restored: companyIds.length };

  const restored = result.restored ?? 0;

  return NextResponse.json({
    message:
      restored === 1
        ? "Company restored successfully."
        : `${restored} companies restored successfully.`,
    restored,
  });
}

import { NextResponse } from "next/server";
import { ensureNoDuplicateCarrier } from "@/lib/carrierApi";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    legalName?: string;
    mcNumber?: string;
    dotNumber?: string;
    scac?: string;
    phone?: string;
    email?: string;
    excludeCarrierId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.legalName?.trim()) {
    return NextResponse.json(
      { error: "Legal carrier name is required." },
      { status: 400 },
    );
  }

  const duplicate = await ensureNoDuplicateCarrier(
    supabase,
    {
      legalName: body.legalName,
      dbaName: "",
      mcNumber: body.mcNumber ?? "",
      dotNumber: body.dotNumber ?? "",
      scac: body.scac ?? "",
      phone: body.phone ?? "",
      email: body.email ?? "",
      website: "",
      status: "pending_verification",
      isBonded: false,
      isHazmat: false,
      serviceTypes: [],
      equipmentTypes: [],
      serviceAreas: [],
      contacts: [],
    },
    body.excludeCarrierId,
  );

  if (!duplicate.duplicate) {
    return NextResponse.json({ duplicate: false });
  }

  return NextResponse.json({
    duplicate: true,
    carrierId: duplicate.duplicate.id,
    carrierName: duplicate.duplicate.legal_name,
    matchedBy: duplicate.matchedBy,
  });
}

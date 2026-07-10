import { NextResponse } from "next/server";
import {
  ensureNoDuplicateCarrier,
  insertCarrierWithChildren,
} from "@/lib/carrierApi";
import { requireActiveCarrierUser } from "@/lib/carrierAuthServer";
import type { CarrierFormInput } from "@/lib/carrierValidation";

export async function POST(request: Request) {
  const auth = await requireActiveCarrierUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: CarrierFormInput;
  try {
    body = (await request.json()) as CarrierFormInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const duplicate = await ensureNoDuplicateCarrier(auth.context.supabase, body);
  if (duplicate.duplicate) {
    return NextResponse.json(
      {
        error: "DUPLICATE",
        message: "This carrier already exists in the Carrier Network.",
        carrierId: duplicate.duplicate.id,
        carrierName: duplicate.duplicate.legal_name,
        matchedBy: duplicate.matchedBy,
      },
      { status: 409 },
    );
  }

  const result = await insertCarrierWithChildren(
    auth.context.supabase,
    auth.context.user.id,
    body,
  );

  if (result.error || !result.carrierId) {
    return NextResponse.json(
      { error: result.error ?? "Unable to create carrier." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    carrierId: result.carrierId,
    message: "Carrier created and added to My Carriers.",
  });
}

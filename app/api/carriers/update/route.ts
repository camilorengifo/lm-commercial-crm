import { NextResponse } from "next/server";
import {
  assertCanSetCarrierStatus,
  ensureNoDuplicateCarrier,
  replaceCarrierChildren,
} from "@/lib/carrierApi";
import { requireCarrierSharedMutationAuth } from "@/lib/carrierAuthServer";
import type { CarrierEditContext } from "@/lib/carrierEditContext";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import {
  buildCarrierInsertPayload,
  validateCarrierForm,
} from "@/lib/carrierValidation";

function parseEditContext(value: unknown): CarrierEditContext | null {
  if (value === "my" || value === "network") {
    return value;
  }
  return null;
}

export async function PATCH(request: Request) {
  let body: {
    carrierId?: string;
    form?: CarrierFormInput;
    editContext?: CarrierEditContext;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.carrierId || !body.form) {
    return NextResponse.json(
      { error: "Carrier ID and form are required." },
      { status: 400 },
    );
  }

  const editContext = parseEditContext(body.editContext);
  if (!editContext) {
    return NextResponse.json(
      { error: "A valid editContext of my or network is required." },
      { status: 400 },
    );
  }

  const auth = await requireCarrierSharedMutationAuth(
    request,
    body.carrierId,
    editContext,
  );
  if (!auth.ok) {
    return auth.response;
  }

  const validationError = validateCarrierForm(body.form);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const statusError = assertCanSetCarrierStatus(
    auth.context.profile,
    body.form.status,
  );
  if (statusError) {
    return NextResponse.json({ error: statusError }, { status: 403 });
  }

  const duplicate = await ensureNoDuplicateCarrier(
    auth.context.supabase,
    body.form,
    body.carrierId,
  );
  if (duplicate.duplicate) {
    return NextResponse.json(
      {
        error: "This carrier already exists in the Carrier Network.",
        carrierId: duplicate.duplicate.id,
      },
      { status: 409 },
    );
  }

  const payload = buildCarrierInsertPayload(body.form);

  const { error: updateError } = await auth.context.supabase
    .from("carriers")
    .update({
      ...payload,
      updated_by: auth.context.user.id,
    })
    .eq("id", body.carrierId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const childResult = await replaceCarrierChildren(
    auth.context.supabase,
    auth.context.user.id,
    body.carrierId,
    body.form,
  );

  if (childResult.error) {
    return NextResponse.json({ error: childResult.error }, { status: 400 });
  }

  return NextResponse.json({ message: "Carrier updated successfully." });
}

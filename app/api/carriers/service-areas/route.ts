import { NextResponse } from "next/server";
import { requireCarrierSharedMutationAuth } from "@/lib/carrierAuthServer";
import type { CarrierEditContext } from "@/lib/carrierEditContext";
import {
  addCarrierServiceArea,
  removeCarrierServiceArea,
  updateCarrierServiceArea,
} from "@/lib/carrierServiceAreaApi";
import type { ServiceAreaInput } from "@/lib/carrierServiceAreas";
import { validateCarrierCountry } from "@/lib/carrierCountries";

function parseEditContext(value: unknown): CarrierEditContext | null {
  if (value === "my" || value === "network") {
    return value;
  }
  return null;
}

function parseServiceAreaBody(body: Record<string, unknown>): {
  input: ServiceAreaInput;
  error: string | null;
} {
  const input: ServiceAreaInput = {
    country: typeof body.country === "string" ? body.country : "",
    state: typeof body.state === "string" ? body.state : "",
    city: typeof body.city === "string" ? body.city : "",
    serviceRadiusMiles:
      typeof body.serviceRadiusMiles === "string"
        ? body.serviceRadiusMiles
        : typeof body.service_radius_miles === "number"
          ? String(body.service_radius_miles)
          : "",
  };

  const countryError = validateCarrierCountry(input.country);
  if (countryError) {
    return { input, error: countryError };
  }

  return { input, error: null };
}

async function authorizeMutation(
  request: Request,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      auth: Awaited<ReturnType<typeof requireCarrierSharedMutationAuth>> & {
        ok: true;
      };
      carrierId: string;
    }
  | { ok: false; response: NextResponse }
> {
  const carrierId = typeof body.carrierId === "string" ? body.carrierId : "";
  const editContext = parseEditContext(body.editContext);

  if (!carrierId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Carrier ID is required." }, { status: 400 }),
    };
  }

  if (!editContext) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A valid editContext of my or network is required." },
        { status: 400 },
      ),
    };
  }

  const auth = await requireCarrierSharedMutationAuth(
    request,
    carrierId,
    editContext,
  );
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }

  return { ok: true, auth, carrierId };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const authorized = await authorizeMutation(request, body);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { input, error: countryError } = parseServiceAreaBody(body);
  if (countryError) {
    return NextResponse.json({ error: countryError }, { status: 400 });
  }

  const result = await addCarrierServiceArea(
    authorized.auth.context.supabase,
    authorized.auth.context.user.id,
    authorized.carrierId,
    input,
  );

  if (result.error || !result.area) {
    return NextResponse.json(
      { error: result.error ?? "Unable to add service area." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Service area added.",
    area: result.area,
  });
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const authorized = await authorizeMutation(request, body);
  if (!authorized.ok) {
    return authorized.response;
  }

  const areaId = typeof body.areaId === "string" ? body.areaId : "";
  if (!areaId) {
    return NextResponse.json({ error: "Area ID is required." }, { status: 400 });
  }

  const { input, error: countryError } = parseServiceAreaBody(body);
  if (countryError) {
    return NextResponse.json({ error: countryError }, { status: 400 });
  }

  const result = await updateCarrierServiceArea(
    authorized.auth.context.supabase,
    authorized.auth.context.user.id,
    authorized.carrierId,
    areaId,
    input,
  );

  if (result.error || !result.area) {
    return NextResponse.json(
      { error: result.error ?? "Unable to update service area." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Service area updated.",
    area: result.area,
  });
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const authorized = await authorizeMutation(request, body);
  if (!authorized.ok) {
    return authorized.response;
  }

  const areaId = typeof body.areaId === "string" ? body.areaId : "";
  if (!areaId) {
    return NextResponse.json({ error: "Area ID is required." }, { status: 400 });
  }

  const result = await removeCarrierServiceArea(
    authorized.auth.context.supabase,
    authorized.auth.context.user.id,
    authorized.carrierId,
    areaId,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: "Service area removed." });
}

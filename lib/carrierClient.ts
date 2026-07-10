import { supabase } from "@/lib/supabaseClient";
import type { CarrierEditContext } from "@/lib/carrierEditContext";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import type { RelationshipStatus } from "@/lib/carrierConstants";
import type { CarrierStatus } from "@/lib/carrierConstants";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function carrierRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<{ data: T | null; error: string | null }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: "You must be signed in." };
  }

  const response = await fetch(path, {
    method: options.method ?? "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json()) as T & {
    error?: string;
    message?: string;
    carrierId?: string;
    carrierName?: string;
  };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? payload.message ?? "Request failed.",
    };
  }

  return { data: payload, error: null };
}

export async function createCarrier(input: CarrierFormInput): Promise<{
  data: { carrierId: string; message: string } | null;
  error: string | null;
  duplicateCarrierId?: string;
  duplicateCarrierName?: string | null;
}> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { data: null, error: "You must be signed in." };
  }

  const response = await fetch("/api/carriers/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as {
    carrierId?: string;
    message?: string;
    error?: string;
    carrierName?: string;
  };

  if (!response.ok) {
    if (response.status === 409 && payload.carrierId) {
      return {
        data: null,
        error: "DUPLICATE",
        duplicateCarrierId: payload.carrierId,
        duplicateCarrierName: payload.carrierName ?? null,
      };
    }
    return {
      data: null,
      error: payload.error ?? payload.message ?? "Request failed.",
    };
  }

  return {
    data: {
      carrierId: payload.carrierId as string,
      message: payload.message ?? "Carrier created.",
    },
    error: null,
  };
}

export async function checkCarrierDuplicate(input: {
  legalName: string;
  mcNumber?: string;
  dotNumber?: string;
  scac?: string;
  phone?: string;
  email?: string;
  excludeCarrierId?: string;
}) {
  return carrierRequest<{
    duplicate: boolean;
    carrierId?: string;
    matchedBy?: string;
    carrierName?: string;
  }>("/api/carriers/check-duplicate", { body: input });
}

export async function addCarrierToMyCarriers(carrierId: string) {
  return carrierRequest<{ message: string }>("/api/carriers/add-to-my-carriers", {
    body: { carrierId },
  });
}

export async function removeCarrierFromMyCarriers(carrierId: string) {
  return carrierRequest<{ message: string }>(
    "/api/carriers/remove-from-my-carriers",
    { body: { carrierId } },
  );
}

export async function updateCarrierShared(input: {
  carrierId: string;
  form: CarrierFormInput;
  editContext: CarrierEditContext;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/update", {
    method: "PATCH",
    body: input,
  });
}

export async function updateMyCarrierRelationship(input: {
  carrierId: string;
  privateNotes?: string | null;
  isPreferred?: boolean;
  relationshipStatus?: RelationshipStatus | null;
  lastContactedAt?: string | null;
  preferredContactId?: string | null;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/my-relationship", {
    method: "PATCH",
    body: input,
  });
}

export async function archiveCarrierAdmin(carrierId: string) {
  return carrierRequest<{ message: string; linkedUsers?: number }>(
    "/api/carriers/admin/archive",
    { body: { carrierId } },
  );
}

export async function mergeCarriersAdmin(input: {
  sourceCarrierId: string;
  targetCarrierId: string;
}) {
  return carrierRequest<{ message: string }>(
    "/api/carriers/admin/merge",
    { body: input },
  );
}

export async function updateCarrierStatusAdmin(input: {
  carrierId: string;
  status: CarrierStatus;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/admin/status", {
    method: "PATCH",
    body: input,
  });
}

export async function addCarrierServiceAreaClient(input: {
  carrierId: string;
  country: string;
  state?: string;
  city?: string;
  serviceRadiusMiles?: string;
  editContext: CarrierEditContext;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/service-areas", {
    method: "POST",
    body: input,
  });
}

export async function updateCarrierServiceAreaClient(input: {
  carrierId: string;
  areaId: string;
  country: string;
  state?: string;
  city?: string;
  serviceRadiusMiles?: string;
  editContext: CarrierEditContext;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/service-areas", {
    method: "PATCH",
    body: input,
  });
}

export async function removeCarrierServiceAreaClient(input: {
  carrierId: string;
  areaId: string;
  editContext: CarrierEditContext;
}) {
  return carrierRequest<{ message: string }>("/api/carriers/service-areas", {
    method: "DELETE",
    body: input,
  });
}

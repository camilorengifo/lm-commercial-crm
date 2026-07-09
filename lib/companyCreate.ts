import {
  COMPANY_PRIORITIES,
  DEFAULT_SALES_STAGE,
  isSalesStage,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import type { CompanyCreateContactForm } from "@/lib/companyCreateContacts";
import {
  buildContactInsertPayload,
  filterNonEmptyContacts,
} from "@/lib/companyCreateContacts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isCompanyPriority(value: string): value is CompanyPriority {
  return (COMPANY_PRIORITIES as readonly string[]).includes(value);
}

export interface CompanyCreateFields {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  general_notes: string | null;
  last_contact_at: string | null;
}

export interface CompanyCreateInput extends CompanyCreateFields {
  ownerUserId?: string | null;
  contacts?: CompanyCreateContactForm[];
}

export function resolveCompanyOwnerUserId(input: {
  authUserId: string;
  requestedOwnerUserId?: string | null;
}): { userId: string; rejectedForeignOwner: boolean } {
  const requested = input.requestedOwnerUserId?.trim();

  if (requested && requested !== input.authUserId) {
    return {
      userId: input.authUserId,
      rejectedForeignOwner: true,
    };
  }

  return {
    userId: input.authUserId,
    rejectedForeignOwner: false,
  };
}

export function buildCompanyInsertPayload(
  authUserId: string,
  fields: CompanyCreateFields,
): Record<string, unknown> {
  return {
    user_id: authUserId,
    name: fields.name.trim(),
    city: fields.city,
    state: fields.state,
    country: fields.country,
    priority: fields.priority,
    sales_stage: fields.sales_stage,
    general_notes: fields.general_notes,
    last_contact_at: fields.last_contact_at,
  };
}

export function parseCompanyCreateFields(body: {
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  priority?: string;
  sales_stage?: string;
  general_notes?: string | null;
  last_contact_at?: string | null;
}): { fields: CompanyCreateFields | null; error: string | null } {
  const name = body.name?.trim() ?? "";

  if (!name) {
    return { fields: null, error: "Company name is required." };
  }

  const priority = body.priority?.trim() || "Medium";
  if (!isCompanyPriority(priority)) {
    return { fields: null, error: "Invalid priority." };
  }

  const salesStage = body.sales_stage?.trim() || DEFAULT_SALES_STAGE;
  if (!isSalesStage(salesStage)) {
    return { fields: null, error: "Invalid sales stage." };
  }

  if (
    body.last_contact_at !== undefined &&
    body.last_contact_at !== null &&
    body.last_contact_at !== "" &&
    Number.isNaN(Date.parse(body.last_contact_at))
  ) {
    return { fields: null, error: "Invalid last contact date." };
  }

  return {
    fields: {
      name,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      country: body.country?.trim() || null,
      priority,
      sales_stage: salesStage,
      general_notes: body.general_notes?.trim() || null,
      last_contact_at: body.last_contact_at || null,
    },
    error: null,
  };
}

export function buildCompanyCreateContactPayloads(
  contacts: CompanyCreateContactForm[] | undefined,
  input: { ownerUserId: string; companyId: string },
) {
  return filterNonEmptyContacts(contacts ?? []).map((contact, index) =>
    buildContactInsertPayload(contact, {
      userId: input.ownerUserId,
      companyId: input.companyId,
      isPrimary: index === 0,
    }),
  );
}

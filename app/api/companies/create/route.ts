import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import {
  buildCompanyCreateContactPayloads,
  buildCompanyInsertPayload,
  parseCompanyCreateFields,
  resolveCompanyOwnerUserId,
} from "@/lib/companyCreate";
import type { CompanyCreateContactForm } from "@/lib/companyCreateContacts";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

interface CreateCompanyBody {
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  priority?: string;
  sales_stage?: string;
  general_notes?: string | null;
  last_contact_at?: string | null;
  ownerUserId?: string | null;
  user_id?: string | null;
  contacts?: CompanyCreateContactForm[];
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
      },
      { status: 403 },
    );
  }

  let body: CreateCompanyBody;
  try {
    body = (await request.json()) as CreateCompanyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { fields, error: fieldsError } = parseCompanyCreateFields(body);
  if (!fields || fieldsError) {
    return NextResponse.json(
      { error: fieldsError ?? "Invalid company fields." },
      { status: 400 },
    );
  }

  const requestedOwnerUserId = body.ownerUserId ?? body.user_id ?? null;
  const { userId: ownerUserId, rejectedForeignOwner } = resolveCompanyOwnerUserId({
    authUserId: user.id,
    requestedOwnerUserId,
  });

  if (rejectedForeignOwner) {
    return NextResponse.json(
      {
        error: isAdminProfile(profile)
          ? "Use Admin → Companies to assign ownership after creating a company."
          : "You cannot create a company for another broker.",
      },
      { status: 403 },
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("companies")
    .insert(buildCompanyInsertPayload(ownerUserId, fields))
    .select("id, user_id")
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message || "Unable to create company." },
      { status: 400 },
    );
  }

  if (created.user_id !== user.id) {
    return NextResponse.json(
      {
        error:
          "Company ownership could not be verified. Please contact an administrator.",
      },
      { status: 500 },
    );
  }

  const contactPayloads = buildCompanyCreateContactPayloads(body.contacts, {
    ownerUserId: created.user_id,
    companyId: created.id,
  });

  let contactsWarning = false;

  if (contactPayloads.length > 0) {
    const { error: contactsError } = await supabase
      .from("contacts")
      .insert(contactPayloads);

    if (contactsError) {
      contactsWarning = true;
    }
  }

  return NextResponse.json({
    message: "Company created successfully.",
    companyId: created.id,
    contactsCreated: contactsWarning ? 0 : contactPayloads.length,
    contactsWarning,
  });
}

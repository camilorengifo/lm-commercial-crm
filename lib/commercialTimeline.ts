import type { ActivityType } from "@/lib/crmConstants";
import { formatContactName } from "@/lib/loadOpportunities";
import { supabase } from "@/lib/supabaseClient";
import { brokerCanAccessCompany } from "@/lib/brokerDataAccess";

export const COMMERCIAL_TIMELINE_ACTIVITY_FIELDS =
  "id, user_id, company_id, contact_id, follow_up_id, activity_type, subject, notes, activity_at, created_at, updated_at, updated_by, scheduled_follow_up_at";

const COMMERCIAL_TIMELINE_ACTIVITY_FIELDS_WITHOUT_EDITOR =
  "id, user_id, company_id, contact_id, follow_up_id, activity_type, subject, notes, activity_at, created_at, updated_at, scheduled_follow_up_at";

export interface CommercialTimelineActivity {
  id: string;
  user_id: string;
  company_id: string;
  contact_id: string | null;
  follow_up_id?: string | null;
  activity_type: ActivityType;
  subject: string | null;
  notes: string | null;
  activity_at: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  scheduled_follow_up_at: string | null;
  contactName: string | null;
  brokerEmail: string | null;
  editedByEmail: string | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
}

function isMissingActivityEditorColumn(error: { message?: string }): boolean {
  return (error.message ?? "").toLowerCase().includes("updated_by");
}

export async function fetchCommercialTimelineActivities(input: {
  companyId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<{ data: CommercialTimelineActivity[]; error: { message?: string } | null }> {
  if (!input.isAdmin) {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, user_id")
      .eq("id", input.companyId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (companyError) {
      return { data: [], error: companyError };
    }

    if (
      !company ||
      !brokerCanAccessCompany({
        companyUserId: company.user_id,
        viewerUserId: input.userId,
        isAdmin: false,
      })
    ) {
      return { data: [], error: { message: "Company not found." } };
    }
  }

  let query = supabase
    .from("activities")
    .select(COMMERCIAL_TIMELINE_ACTIVITY_FIELDS)
    .eq("company_id", input.companyId)
    .order("activity_at", { ascending: false });

  if (!input.isAdmin) {
    query = query.eq("user_id", input.userId);
  }

  let { data, error } = await query;

  if (error && isMissingActivityEditorColumn(error)) {
    let legacyQuery = supabase
      .from("activities")
      .select(COMMERCIAL_TIMELINE_ACTIVITY_FIELDS_WITHOUT_EDITOR)
      .eq("company_id", input.companyId)
      .order("activity_at", { ascending: false });

    if (!input.isAdmin) {
      legacyQuery = legacyQuery.eq("user_id", input.userId);
    }

    const legacy = await legacyQuery;
    if (legacy.error) {
      return { data: [], error: legacy.error };
    }

    data = (legacy.data ?? []).map((row) => ({
      ...row,
      updated_by: null,
    }));
    error = null;
  }

  if (error) {
    return { data: [], error };
  }

  const rows = (data ?? []) as Omit<
    CommercialTimelineActivity,
    "contactName" | "brokerEmail" | "editedByEmail"
  >[];

  const contactIds = [
    ...new Set(
      rows
        .map((row) => row.contact_id)
        .filter((contactId): contactId is string => Boolean(contactId)),
    ),
  ];

  const userIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.updated_by ? [row.user_id, row.updated_by] : [row.user_id],
      ),
    ),
  ];

  const contactsById = new Map<string, ContactRow>();
  const profilesByUserId = new Map<string, string | null>();

  if (contactIds.length > 0) {
    let contactsQuery = supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .in("id", contactIds);

    if (!input.isAdmin) {
      contactsQuery = contactsQuery.eq("user_id", input.userId);
    }

    const { data: contacts, error: contactsError } = await contactsQuery;

    if (contactsError) {
      return { data: [], error: contactsError };
    }

    for (const contact of contacts ?? []) {
      contactsById.set(contact.id, contact as ContactRow);
    }
  }

  if (userIds.length > 0 && input.isAdmin) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (profilesError) {
      return { data: [], error: profilesError };
    }

    for (const profile of profiles ?? []) {
      profilesByUserId.set(profile.id, profile.email ?? null);
    }
  }

  return {
    data: rows.map((row) => {
      const contact = row.contact_id
        ? contactsById.get(row.contact_id) ?? null
        : null;

      return {
        ...row,
        contactName: contact ? formatContactName(contact) : null,
        brokerEmail: profilesByUserId.get(row.user_id) ?? null,
        editedByEmail: row.updated_by
          ? profilesByUserId.get(row.updated_by) ?? null
          : null,
      };
    }),
    error: null,
  };
}

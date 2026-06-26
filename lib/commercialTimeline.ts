import type { ActivityType } from "@/lib/crmConstants";
import { formatContactName } from "@/lib/loadOpportunities";
import { supabase } from "@/lib/supabaseClient";

export const COMMERCIAL_TIMELINE_ACTIVITY_FIELDS =
  "id, user_id, company_id, contact_id, activity_type, subject, notes, activity_at, created_at, scheduled_follow_up_at";

export interface CommercialTimelineActivity {
  id: string;
  user_id: string;
  company_id: string;
  contact_id: string | null;
  activity_type: ActivityType;
  subject: string | null;
  notes: string | null;
  activity_at: string;
  created_at: string;
  scheduled_follow_up_at: string | null;
  contactName: string | null;
  brokerEmail: string | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
}

export async function fetchCommercialTimelineActivities(input: {
  companyId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<{ data: CommercialTimelineActivity[]; error: { message?: string } | null }> {
  let query = supabase
    .from("activities")
    .select(COMMERCIAL_TIMELINE_ACTIVITY_FIELDS)
    .eq("company_id", input.companyId)
    .order("activity_at", { ascending: false });

  if (!input.isAdmin) {
    query = query.eq("user_id", input.userId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error };
  }

  const rows = (data ?? []) as Omit<
    CommercialTimelineActivity,
    "contactName" | "brokerEmail"
  >[];

  const contactIds = [
    ...new Set(
      rows
        .map((row) => row.contact_id)
        .filter((contactId): contactId is string => Boolean(contactId)),
    ),
  ];

  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const contactsById = new Map<string, ContactRow>();
  const profilesByUserId = new Map<string, string | null>();

  if (contactIds.length > 0) {
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .in("id", contactIds);

    if (contactsError) {
      return { data: [], error: contactsError };
    }

    for (const contact of contacts ?? []) {
      contactsById.set(contact.id, contact as ContactRow);
    }
  }

  if (userIds.length > 0) {
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
      };
    }),
    error: null,
  };
}

import { supabase } from "@/lib/supabaseClient";
import {
  commercialActivityUpdateBody,
  type ActivityEditDraft,
} from "@/lib/activityEdit";

export async function updateCommercialActivity(input: {
  activityId: string;
  companyId: string;
  draft: ActivityEditDraft;
}): Promise<{ error: string | null; message: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;

  if (!accessToken) {
    return { error: "You must be signed in.", message: null };
  }

  const response = await fetch("/api/activities/update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      commercialActivityUpdateBody({
        activityId: input.activityId,
        companyId: input.companyId,
        draft: input.draft,
      }),
    ),
  });

  let payload: { error?: string; message?: string } = {};
  try {
    payload = (await response.json()) as { error?: string; message?: string };
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      error: payload.error ?? "Unable to update this activity.",
      message: null,
    };
  }

  return {
    error: null,
    message: payload.message ?? "Activity updated.",
  };
}

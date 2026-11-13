import {
  isMissingColumnError,
  isUniqueViolation,
} from "@/lib/followUpIdempotency";
import { supabase } from "@/lib/supabaseClient";

/**
 * Inserts one activity for a creation key.
 * A repeated key returns the existing row instead of a second timeline entry.
 * If the column is not migrated yet, the insert proceeds without the key.
 */
export async function insertActivityOnce(input: {
  creationKey: string | null;
  values: Record<string, unknown>;
}): Promise<{ error: { message?: string; code?: string } | null }> {
  const creationKey = input.creationKey;

  if (creationKey) {
    const existing = await findActivityByCreationKey(creationKey);
    if (existing.error) return { error: existing.error };
    if (existing.row) return { error: null };

    const inserted = await insertActivity(
      { ...input.values, creation_key: creationKey },
    );

    if (!inserted.error) return { error: null };

    if (isMissingColumnError(inserted.error, "creation_key")) {
      return insertActivity(input.values);
    }

    if (isUniqueViolation(inserted.error)) {
      const raced = await findActivityByCreationKey(creationKey);
      if (raced.row || raced.unsupported) return { error: null };
      if (raced.error) return { error: raced.error };
    }

    return { error: inserted.error };
  }

  return insertActivity(input.values);
}

async function insertActivity(
  values: Record<string, unknown>,
): Promise<{ error: { message?: string; code?: string } | null }> {
  const { error } = await supabase.from("activities").insert(values);
  return { error };
}

async function findActivityByCreationKey(creationKey: string): Promise<{
  row: { id: string } | null;
  unsupported: boolean;
  error: { message?: string; code?: string } | null;
}> {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("creation_key", creationKey)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error, "creation_key")) {
      return { row: null, unsupported: true, error: null };
    }
    return { row: null, unsupported: false, error };
  }

  return {
    row: (data as { id: string } | null) ?? null,
    unsupported: false,
    error: null,
  };
}

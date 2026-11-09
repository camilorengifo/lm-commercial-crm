-- Permanent user deletion after CRM ownership has been reassigned.
--
-- Active ownership (companies, contacts, activities, follow-ups, opportunities,
-- insights, and outreach suppressions) still uses user_id and must be moved
-- by reassign_user_crm_ownership before a user can be deleted. Those rows are
-- never deleted here.
--
-- Historical actor columns must not block auth.users deletion. This migration
-- stores the person's name on the row and changes blocking foreign keys to
-- ON DELETE SET NULL.
--
-- ai_broker_assistant_runs is defined in 010_ai_broker_assistant_runs.sql and
-- is already optional in 035_reassign_user_crm_ownership.sql. Production does
-- not have that table, and it has no alternate name. Every table and column
-- change below is skipped when information_schema shows it is absent. This
-- script does not create that table.

DO $migration_043$
DECLARE
  v_table TEXT;
  v_source_column TEXT;
  v_name_column TEXT;
  v_constraint TEXT;
BEGIN
  -- Name snapshots. Added only when the historical table already exists.
  FOR v_table, v_name_column IN
    SELECT *
    FROM (
      VALUES
        ('carriers'::text, 'created_by_name'::text),
        ('carriers'::text, 'updated_by_name'::text),
        ('carrier_contacts'::text, 'created_by_name'::text),
        ('outreach_draft_feedback'::text, 'author_name'::text),
        ('activities'::text, 'updated_by_name'::text),
        ('activity_edit_audits'::text, 'editor_name'::text),
        ('companies'::text, 'deleted_by_name'::text),
        ('companies'::text, 'archived_by_name'::text),
        ('follow_ups'::text, 'disposition_by_name'::text),
        ('outreach_suppressions'::text, 'created_by_name'::text),
        ('outreach_suppressions'::text, 'lifted_by_name'::text),
        ('company_delete_events'::text, 'actor_name'::text),
        ('broker_reminder_logs'::text, 'user_name'::text),
        ('ai_broker_assistant_runs'::text, 'user_name'::text)
    ) AS snapshot(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_name_column
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN %I TEXT',
        v_table,
        v_name_column
      );
    END IF;
  END LOOP;

  -- Copy the current profile name onto historical rows. Rows themselves stay.
  FOR v_table, v_source_column, v_name_column IN
    SELECT *
    FROM (
      VALUES
        ('carriers'::text, 'created_by'::text, 'created_by_name'::text),
        ('carriers'::text, 'updated_by'::text, 'updated_by_name'::text),
        ('carrier_contacts'::text, 'created_by'::text, 'created_by_name'::text),
        ('outreach_draft_feedback'::text, 'user_id'::text, 'author_name'::text),
        ('activities'::text, 'updated_by'::text, 'updated_by_name'::text),
        ('activity_edit_audits'::text, 'editor_user_id'::text, 'editor_name'::text),
        ('companies'::text, 'deleted_by'::text, 'deleted_by_name'::text),
        ('companies'::text, 'archived_by'::text, 'archived_by_name'::text),
        ('follow_ups'::text, 'disposition_by'::text, 'disposition_by_name'::text),
        ('outreach_suppressions'::text, 'created_by'::text, 'created_by_name'::text),
        ('outreach_suppressions'::text, 'lifted_by'::text, 'lifted_by_name'::text),
        ('company_delete_events'::text, 'user_id'::text, 'actor_name'::text),
        ('broker_reminder_logs'::text, 'user_id'::text, 'user_name'::text),
        ('ai_broker_assistant_runs'::text, 'user_id'::text, 'user_name'::text)
    ) AS backfill(table_name, source_column, name_column)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_source_column
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_name_column
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
    ) THEN
      EXECUTE format(
        'UPDATE public.%I AS row
         SET %I = COALESCE(NULLIF(btrim(profile.full_name), ''''), profile.email)
         FROM public.profiles AS profile
         WHERE row.%I = profile.id
           AND row.%I IS NULL',
        v_table,
        v_name_column,
        v_source_column,
        v_name_column
      );
    END IF;
  END LOOP;

  -- Historical foreign keys that currently block auth.users deletion.
  -- Ownership user_id columns are not in this list.
  FOR v_table, v_source_column IN
    SELECT *
    FROM (
      VALUES
        ('carriers'::text, 'created_by'::text),
        ('carrier_contacts'::text, 'created_by'::text),
        ('outreach_draft_feedback'::text, 'user_id'::text),
        ('broker_reminder_logs'::text, 'user_id'::text),
        ('ai_broker_assistant_runs'::text, 'user_id'::text)
    ) AS historical(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table
    ) OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_source_column
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
      v_table,
      v_source_column
    );

    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint AS con
      JOIN pg_class AS rel ON rel.oid = con.conrelid
      JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute AS att
        ON att.attrelid = rel.oid
       AND att.attnum = ANY (con.conkey)
      WHERE nsp.nspname = 'public'
        AND rel.relname = v_table
        AND att.attname = v_source_column
        AND con.contype = 'f'
        AND con.confrelid = 'auth.users'::regclass
    LOOP
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        v_table,
        v_constraint
      );
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS con
      JOIN pg_class AS rel ON rel.oid = con.conrelid
      JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = v_table
        AND con.conname = v_table || '_' || v_source_column || '_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users (id) ON DELETE SET NULL',
        v_table,
        v_table || '_' || v_source_column || '_fkey',
        v_source_column
      );
    END IF;
  END LOOP;
END
$migration_043$;

CREATE OR REPLACE FUNCTION public.prepare_user_permanent_deletion(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key INTEGER;
  v_remaining INTEGER := 0;
  v_extra INTEGER := 0;
  v_label TEXT;
  v_table TEXT;
  v_source_column TEXT;
  v_name_column TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only an administrator can delete a user.';
  END IF;

  v_lock_key := hashtext(p_user_id::text) & 2147483647;
  PERFORM pg_advisory_xact_lock(814201, v_lock_key);

  SELECT
    (SELECT count(*) FROM public.companies WHERE user_id = p_user_id) +
    (SELECT count(*) FROM public.contacts WHERE user_id = p_user_id) +
    (SELECT count(*) FROM public.activities WHERE user_id = p_user_id) +
    (SELECT count(*) FROM public.follow_ups WHERE user_id = p_user_id) +
    (SELECT count(*) FROM public.load_opportunities WHERE user_id = p_user_id) +
    (SELECT count(*) FROM public.company_ai_insights WHERE user_id = p_user_id)
  INTO v_remaining;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'outreach_suppressions'
  ) THEN
    EXECUTE
      'SELECT count(*) FROM public.outreach_suppressions WHERE user_id = $1'
    INTO v_extra
    USING p_user_id;
    v_remaining := v_remaining + COALESCE(v_extra, 0);
  END IF;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'This user still owns CRM records. Please reassign all records before deleting.';
  END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(email), ''), p_user_id::text)
  INTO v_label
  FROM public.profiles
  WHERE id = p_user_id;

  v_label := COALESCE(v_label, p_user_id::text);

  -- Snapshot the person on historical rows that exist in this database.
  -- Ownership columns are not changed, and no commercial row is deleted.
  FOR v_table, v_source_column, v_name_column IN
    SELECT *
    FROM (
      VALUES
        ('carriers'::text, 'created_by'::text, 'created_by_name'::text),
        ('carriers'::text, 'updated_by'::text, 'updated_by_name'::text),
        ('carrier_contacts'::text, 'created_by'::text, 'created_by_name'::text),
        ('outreach_draft_feedback'::text, 'user_id'::text, 'author_name'::text),
        ('activities'::text, 'updated_by'::text, 'updated_by_name'::text),
        ('activity_edit_audits'::text, 'editor_user_id'::text, 'editor_name'::text),
        ('companies'::text, 'deleted_by'::text, 'deleted_by_name'::text),
        ('companies'::text, 'archived_by'::text, 'archived_by_name'::text),
        ('follow_ups'::text, 'disposition_by'::text, 'disposition_by_name'::text),
        ('outreach_suppressions'::text, 'created_by'::text, 'created_by_name'::text),
        ('outreach_suppressions'::text, 'lifted_by'::text, 'lifted_by_name'::text),
        ('company_delete_events'::text, 'user_id'::text, 'actor_name'::text),
        ('broker_reminder_logs'::text, 'user_id'::text, 'user_name'::text),
        ('ai_broker_assistant_runs'::text, 'user_id'::text, 'user_name'::text)
    ) AS snapshot(table_name, source_column, name_column)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_source_column
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = v_name_column
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = COALESCE(%I, $1) WHERE %I = $2',
        v_table,
        v_name_column,
        v_name_column,
        v_source_column
      )
      USING v_label, p_user_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_user_permanent_deletion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_user_permanent_deletion(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_user_permanent_deletion(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_user_permanent_deletion(UUID) TO service_role;

COMMENT ON FUNCTION public.prepare_user_permanent_deletion(UUID) IS
  'Rejects deletion while the user still owns CRM records, and stores the user name on historical rows that exist. Does not delete companies, contacts, activities, or follow-ups.';

NOTIFY pgrst, 'reload schema';

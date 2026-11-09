-- Keep historical user references from blocking or cascading away when an
-- auth user is deleted. This does not change ownership columns
-- (companies, contacts, activities, follow_ups, load_opportunities,
-- company_ai_insights, outreach_suppressions, user_carriers).
-- It does not update or delete any existing rows.
--
-- broker_reminder_logs.user_id was created NOT NULL ON DELETE CASCADE.
-- Migration 043 makes that column nullable ON DELETE SET NULL when the table
-- exists. This migration repeats that change and applies the same action to
-- company_delete_events.user_id, which is still ON DELETE CASCADE.
-- Apply this file separately in the Supabase SQL editor. Do not run it as
-- part of an application deploy.

DO $migration_044$
DECLARE
  v_table TEXT;
  v_column TEXT;
  v_constraint TEXT;
BEGIN
  FOR v_table, v_column IN
    SELECT *
    FROM (
      VALUES
        ('broker_reminder_logs'::text, 'user_id'::text),
        ('company_delete_events'::text, 'user_id'::text)
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
        AND column_name = v_column
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
      v_table,
      v_column
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
        AND att.attname = v_column
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
        AND con.conname = v_table || '_' || v_column || '_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users (id) ON DELETE SET NULL',
        v_table,
        v_table || '_' || v_column || '_fkey',
        v_column
      );
    END IF;
  END LOOP;
END
$migration_044$;

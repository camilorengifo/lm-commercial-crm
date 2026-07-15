-- Initial bulk company field update RPC.
-- Prefer applying 029_bulk_update_company_fields_fix.sql (same definition).
-- companies.priority = public.company_priority
-- companies.account_status = TEXT
-- companies.sales_stage = TEXT

DROP FUNCTION IF EXISTS public.bulk_update_company_fields(
  UUID[],
  public.company_priority,
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.bulk_update_company_fields(
  p_company_ids UUID[],
  p_priority public.company_priority DEFAULT NULL,
  p_account_status TEXT DEFAULT NULL,
  p_sales_stage TEXT DEFAULT NULL
)
RETURNS TABLE (
  updated_count INTEGER,
  failed_count INTEGER,
  error_messages TEXT[],
  updated_ids UUID[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_owner_id UUID;
  v_old_priority public.company_priority;
  v_old_sales_stage TEXT;
  v_old_account_status TEXT;
  v_new_account_status TEXT;
  v_new_sales_stage TEXT;
  v_updated INTEGER := 0;
  v_failed INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_updated_ids UUID[] := ARRAY[]::UUID[];
  v_note_parts TEXT[] := ARRAY[]::TEXT[];
  v_activity_notes TEXT;
  v_has_field_change BOOLEAN;
  v_actor_label TEXT;
  v_rows_updated INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(NULLIF(trim(email), ''), v_user_id::TEXT)
  INTO v_actor_label
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_actor_label IS NULL THEN
    v_actor_label := v_user_id::TEXT;
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  IF p_company_ids IS NULL OR cardinality(p_company_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one company.';
  END IF;

  IF cardinality(p_company_ids) > 100 THEN
    RAISE EXCEPTION 'You can update up to 100 companies at once.';
  END IF;

  IF p_priority IS NULL
     AND NULLIF(trim(COALESCE(p_sales_stage, '')), '') IS NULL
     AND NULLIF(trim(COALESCE(p_account_status, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Select at least one field to update.';
  END IF;

  IF p_account_status IS NOT NULL THEN
    v_new_account_status := lower(trim(p_account_status));
    IF v_new_account_status NOT IN ('active', 'paused', 'archived') THEN
      RAISE EXCEPTION 'Invalid account status';
    END IF;
  ELSE
    v_new_account_status := NULL;
  END IF;

  IF p_sales_stage IS NOT NULL THEN
    v_new_sales_stage := trim(p_sales_stage);
    IF v_new_sales_stage = '' THEN
      RAISE EXCEPTION 'Invalid sales stage';
    END IF;
    IF v_new_sales_stage NOT IN (
      'New Lead',
      'Contacted',
      'In Follow-up',
      'Quoted',
      'Customer',
      'Not Interested',
      'Dormant'
    ) THEN
      RAISE EXCEPTION 'Invalid sales stage';
    END IF;
  ELSE
    v_new_sales_stage := NULL;
  END IF;

  FOREACH v_company_id IN ARRAY p_company_ids
  LOOP
    BEGIN
      SELECT
        user_id,
        priority,
        sales_stage,
        COALESCE(account_status, 'active')
      INTO
        v_owner_id,
        v_old_priority,
        v_old_sales_stage,
        v_old_account_status
      FROM public.companies
      WHERE id = v_company_id;

      IF v_owner_id IS NULL THEN
        v_failed := v_failed + 1;
        v_errors := array_append(
          v_errors,
          format('Company %s not found or not authorized.', v_company_id)
        );
        CONTINUE;
      END IF;

      IF NOT public.is_admin() AND v_owner_id <> v_user_id THEN
        v_failed := v_failed + 1;
        v_errors := array_append(
          v_errors,
          format('You do not have permission to update company %s.', v_company_id)
        );
        CONTINUE;
      END IF;

      v_has_field_change := FALSE;
      v_note_parts := ARRAY[]::TEXT[];

      IF p_priority IS NOT NULL AND p_priority IS DISTINCT FROM v_old_priority THEN
        v_has_field_change := TRUE;
        v_note_parts := array_append(
          v_note_parts,
          format('Priority: %s → %s', v_old_priority::TEXT, p_priority::TEXT)
        );
      END IF;

      IF v_new_sales_stage IS NOT NULL
         AND v_new_sales_stage IS DISTINCT FROM v_old_sales_stage THEN
        v_has_field_change := TRUE;
        v_note_parts := array_append(
          v_note_parts,
          format(
            'Sales Stage: %s → %s',
            COALESCE(v_old_sales_stage, '(none)'),
            v_new_sales_stage
          )
        );
      END IF;

      IF v_new_account_status IS NOT NULL
         AND v_new_account_status IS DISTINCT FROM lower(trim(v_old_account_status)) THEN
        v_has_field_change := TRUE;
        v_note_parts := array_append(
          v_note_parts,
          format(
            'Account Status: %s → %s',
            initcap(v_old_account_status),
            initcap(v_new_account_status)
          )
        );
      END IF;

      IF NOT v_has_field_change THEN
        v_updated := v_updated + 1;
        v_updated_ids := array_append(v_updated_ids, v_company_id);
        CONTINUE;
      END IF;

      UPDATE public.companies
      SET
        priority = COALESCE(p_priority, priority),
        sales_stage = COALESCE(v_new_sales_stage, sales_stage),
        account_status = COALESCE(v_new_account_status, account_status),
        archived_at = CASE
          WHEN v_new_account_status = 'archived' THEN COALESCE(archived_at, now())
          WHEN v_new_account_status IN ('active', 'paused') THEN NULL
          ELSE archived_at
        END,
        archived_by = CASE
          WHEN v_new_account_status = 'archived' THEN COALESCE(archived_by, v_user_id)
          WHEN v_new_account_status IN ('active', 'paused') THEN NULL
          ELSE archived_by
        END,
        archive_reason = CASE
          WHEN v_new_account_status IN ('active', 'paused') THEN NULL
          ELSE archive_reason
        END,
        archive_notes = CASE
          WHEN v_new_account_status IN ('active', 'paused') THEN NULL
          ELSE archive_notes
        END,
        account_disposition = CASE
          WHEN v_new_account_status = 'active' THEN NULL
          ELSE account_disposition
        END
      WHERE id = v_company_id;

      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

      IF v_rows_updated = 0 THEN
        v_failed := v_failed + 1;
        v_errors := array_append(
          v_errors,
          format('Company %s could not be updated (not authorized).', v_company_id)
        );
        CONTINUE;
      END IF;

      v_activity_notes :=
        format(
          'Bulk update by %s. %s',
          v_actor_label,
          array_to_string(v_note_parts, '; ')
        );

      INSERT INTO public.activities (
        user_id,
        company_id,
        activity_type,
        subject,
        notes,
        activity_at
      )
      VALUES (
        v_user_id,
        v_company_id,
        'note',
        'Bulk company update',
        v_activity_notes,
        now()
      );

      v_updated := v_updated + 1;
      v_updated_ids := array_append(v_updated_ids, v_company_id);
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
        v_errors := array_append(
          v_errors,
          format('Unable to update company %s: %s', v_company_id, SQLERRM)
        );
    END;
  END LOOP;

  updated_count := v_updated;
  failed_count := v_failed;
  error_messages := v_errors;
  updated_ids := v_updated_ids;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_company_fields(
  UUID[],
  public.company_priority,
  TEXT,
  TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Mark Complete closes the current follow-up and inserts the next one.
-- The original due_at is never rewritten. The next due date for a successful
-- completion on "Automatic – 1 Week" is exactly seven America/Bogota calendar
-- days after completed_at. One source follow-up can have only one successor
-- (follow_ups_one_successor_per_source_idx), and the row lock makes a double
-- click or a retried request return that same pair.

CREATE OR REPLACE FUNCTION public.complete_follow_up_and_schedule_next(
  p_follow_up_id UUID,
  p_company_id UUID,
  p_outcome TEXT,
  p_schedule_mode TEXT,
  p_new_due_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.follow_ups%ROWTYPE;
  v_owner_id UUID;
  v_completed_at TIMESTAMPTZ;
  v_original_due TIMESTAMPTZ;
  v_saved_due TIMESTAMPTZ;
  v_next_due TIMESTAMPTZ;
  v_next_id UUID;
  v_already_completed BOOLEAN := false;
  v_already_scheduled BOOLEAN := false;
  v_follow_up_type TEXT;
  v_lead_days INTEGER;
  v_seasonal_context TEXT;
  v_reminder_start TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  IF p_outcome NOT IN ('completed_contact', 'no_response') THEN
    RAISE EXCEPTION 'Unsupported follow-up outcome.';
  END IF;

  IF p_schedule_mode NOT IN ('automatic_week', 'choose_datetime') THEN
    RAISE EXCEPTION 'Unsupported scheduling option.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.follow_ups
  WHERE id = p_follow_up_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Follow-up not found.';
  END IF;

  IF NOT (
    public.is_admin()
    OR v_row.user_id = v_user_id
    OR public.user_owns_active_company(p_company_id)
  ) THEN
    RAISE EXCEPTION 'You cannot complete this follow-up.';
  END IF;

  IF v_row.status = 'do_not_follow_up'::public.follow_up_status THEN
    RAISE EXCEPTION 'This follow-up was closed with Do Not Follow Up and cannot be completed.';
  END IF;

  SELECT user_id
  INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id
    AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;

  v_original_due := v_row.due_at;

  IF v_row.status = 'completed'::public.follow_up_status THEN
    v_already_completed := true;
    v_completed_at := v_row.completed_at;

    IF v_completed_at IS NULL THEN
      v_completed_at := now();
      UPDATE public.follow_ups
      SET completed_at = v_completed_at
      WHERE id = p_follow_up_id
        AND company_id = p_company_id
        AND status = 'completed'::public.follow_up_status
        AND due_at = v_original_due;
    END IF;
  ELSIF v_row.status IS DISTINCT FROM 'pending'::public.follow_up_status THEN
    RAISE EXCEPTION 'Only pending follow-ups can be completed.';
  ELSE
    v_completed_at := now();

    UPDATE public.follow_ups
    SET
      status = 'completed'::public.follow_up_status,
      completed_at = v_completed_at
    WHERE id = p_follow_up_id
      AND company_id = p_company_id
      AND status = 'pending'::public.follow_up_status
      AND due_at = v_original_due;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Follow-up could not be marked complete. It is still open.';
    END IF;
  END IF;

  SELECT due_at
  INTO v_saved_due
  FROM public.follow_ups
  WHERE id = p_follow_up_id
    AND company_id = p_company_id;

  IF v_saved_due IS DISTINCT FROM v_original_due THEN
    RAISE EXCEPTION 'Original due date must stay unchanged.';
  END IF;

  SELECT id, due_at
  INTO v_next_id, v_next_due
  FROM public.follow_ups
  WHERE source_follow_up_id = p_follow_up_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_next_id IS NOT NULL THEN
    v_already_scheduled := true;
  ELSE
    IF p_schedule_mode = 'automatic_week' AND p_outcome = 'completed_contact' THEN
      v_next_due := (
        (v_completed_at AT TIME ZONE 'America/Bogota') + interval '7 days'
      ) AT TIME ZONE 'America/Bogota';
    ELSE
      IF p_new_due_at IS NULL OR p_new_due_at <= now() THEN
        RAISE EXCEPTION 'Choose a future date and time.';
      END IF;
      v_next_due := p_new_due_at;
    END IF;

    v_follow_up_type := COALESCE(NULLIF(btrim(v_row.follow_up_type), ''), 'regular');

    IF v_follow_up_type = 'seasonal' THEN
      v_lead_days := v_row.reminder_lead_days;
      v_seasonal_context := NULLIF(btrim(v_row.seasonal_context), '');
      IF v_lead_days IS NOT NULL THEN
        v_reminder_start := (
          (v_next_due AT TIME ZONE 'America/Bogota')
          - make_interval(days => v_lead_days)
        ) AT TIME ZONE 'America/Bogota';
      ELSE
        v_reminder_start := NULL;
      END IF;
    ELSE
      v_follow_up_type := 'regular';
      v_lead_days := NULL;
      v_seasonal_context := NULL;
      v_reminder_start := NULL;
    END IF;

    BEGIN
      INSERT INTO public.follow_ups (
        user_id,
        company_id,
        contact_id,
        title,
        notes,
        due_at,
        status,
        source_follow_up_id,
        follow_up_type,
        reminder_lead_days,
        reminder_start_date,
        seasonal_context
      )
      VALUES (
        v_owner_id,
        p_company_id,
        v_row.contact_id,
        v_row.title,
        v_row.notes,
        v_next_due,
        'pending'::public.follow_up_status,
        p_follow_up_id,
        v_follow_up_type,
        v_lead_days,
        v_reminder_start,
        v_seasonal_context
      )
      RETURNING id INTO v_next_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT id, due_at
        INTO v_next_id, v_next_due
        FROM public.follow_ups
        WHERE source_follow_up_id = p_follow_up_id
        ORDER BY created_at ASC
        LIMIT 1;

        v_already_scheduled := v_next_id IS NOT NULL;

        IF v_next_id IS NULL THEN
          RAISE;
        END IF;
    END;
  END IF;

  UPDATE public.companies
  SET next_follow_up_at = (
    SELECT min(follow_up.due_at)
    FROM public.follow_ups AS follow_up
    WHERE follow_up.company_id = p_company_id
      AND follow_up.status = 'pending'::public.follow_up_status
  )
  WHERE id = p_company_id;

  RETURN jsonb_build_object(
    'id', p_follow_up_id,
    'status', 'completed',
    'completedAt', v_completed_at,
    'dueAt', v_original_due,
    'alreadyCompleted', v_already_completed,
    'nextFollowUpId', v_next_id,
    'nextDueAt', v_next_due,
    'alreadyScheduled', v_already_scheduled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_follow_up_and_schedule_next(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_follow_up_and_schedule_next(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_follow_up_and_schedule_next(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.complete_follow_up_and_schedule_next(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) IS
  'Close one follow-up without changing due_at, and insert one pending successor. Mark Complete automatic mode schedules seven Bogota calendar days after completed_at. A second call returns the existing pair.';

NOTIFY pgrst, 'reload schema';

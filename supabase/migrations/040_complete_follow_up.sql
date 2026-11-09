-- Complete one follow-up without changing its assignee.
-- Brokers can see follow-ups on companies they own even when
-- follow_ups.user_id has drifted. The table UPDATE policy still requires
-- follow_ups.user_id = auth.uid(), so that drift made Mark Complete match
-- zero rows and the client treated the miss as success. This function
-- writes only status and completed_at after checking company ownership.

CREATE OR REPLACE FUNCTION public.complete_follow_up(
  p_follow_up_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.follow_ups%ROWTYPE;
  v_completed_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
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

  IF v_row.status = 'completed'::public.follow_up_status THEN
    IF v_row.completed_at IS NULL THEN
      UPDATE public.follow_ups
      SET completed_at = now()
      WHERE id = p_follow_up_id
        AND company_id = p_company_id
        AND status = 'completed'::public.follow_up_status
      RETURNING completed_at INTO v_completed_at;
    ELSE
      v_completed_at := v_row.completed_at;
    END IF;

    RETURN jsonb_build_object(
      'id', v_row.id,
      'status', 'completed',
      'completedAt', v_completed_at,
      'alreadyCompleted', true
    );
  END IF;

  IF v_row.status IS DISTINCT FROM 'pending'::public.follow_up_status THEN
    RAISE EXCEPTION 'Only pending follow-ups can be completed.';
  END IF;

  UPDATE public.follow_ups
  SET
    status = 'completed'::public.follow_up_status,
    completed_at = now()
  WHERE id = p_follow_up_id
    AND company_id = p_company_id
    AND status = 'pending'::public.follow_up_status
  RETURNING completed_at INTO v_completed_at;

  IF v_completed_at IS NULL THEN
    RAISE EXCEPTION 'Follow-up could not be marked complete. It is still open.';
  END IF;

  RETURN jsonb_build_object(
    'id', p_follow_up_id,
    'status', 'completed',
    'completedAt', v_completed_at,
    'alreadyCompleted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_follow_up(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_follow_up(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_follow_up(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.complete_follow_up(UUID, UUID) IS
  'Mark one follow-up completed and set completed_at. Does not change user_id, due date, or company assignment.';

NOTIFY pgrst, 'reload schema';

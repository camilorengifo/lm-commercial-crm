-- Delete one commercial timeline entry.
-- Removes that activities row and its own edit-audit rows only.
-- Follow-ups, contacts, other activities, and the company record stay in place.
-- Automatic follow-up and suppression history cannot be deleted here.
--
-- Foreign keys reviewed:
--   activity_edit_audits.activity_id -> activities(id) ON DELETE CASCADE
--     (audit rows belong to the deleted entry; they are removed with it)
--   activities.follow_up_id -> follow_ups(id) ON DELETE SET NULL
--     (deleting an activity does not delete the follow-up)
--   activities.contact_id -> contacts(id) ON DELETE SET NULL
--   activities.company_id -> companies(id) ON DELETE CASCADE
--     (company deletion removes activities; this function does not delete companies)
-- No other table references activities.

CREATE OR REPLACE FUNCTION public.delete_commercial_activity(
  p_activity_id UUID,
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_activity_user_id UUID;
  v_activity_type TEXT;
  v_activity_at TIMESTAMPTZ;
  v_deleted INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  SELECT
    a.user_id,
    a.activity_type::text,
    a.activity_at
  INTO
    v_activity_user_id,
    v_activity_type,
    v_activity_at
  FROM public.activities a
  WHERE a.id = p_activity_id
    AND a.company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found.';
  END IF;

  IF NOT public.is_admin() THEN
    IF v_activity_user_id IS DISTINCT FROM v_user_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.companies c
         WHERE c.id = p_company_id
           AND c.user_id = v_user_id
           AND c.deleted_at IS NULL
       ) THEN
      RAISE EXCEPTION 'You do not have permission to delete this activity.';
    END IF;
  END IF;

  IF v_activity_type IN (
    'follow_up_no_response',
    'follow_up_rescheduled_contact',
    'do_not_follow_up',
    'outreach_suppression'
  ) THEN
    RAISE EXCEPTION 'This timeline entry cannot be deleted.';
  END IF;

  DELETE FROM public.activity_edit_audits
  WHERE activity_id = p_activity_id
    AND company_id = p_company_id;

  DELETE FROM public.activities
  WHERE id = p_activity_id
    AND company_id = p_company_id
    AND (
      public.is_admin()
      OR user_id = v_user_id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Activity not found.';
  END IF;

  -- company_last_contact_refresh: only when this entry was the stored contact date.
  IF v_activity_type NOT IN (
    'follow_up_no_response',
    'do_not_follow_up',
    'outreach_suppression'
  ) THEN
    UPDATE public.companies
    SET last_contact_at = (
      SELECT max(remaining.activity_at)
      FROM public.activities remaining
      WHERE remaining.company_id = p_company_id
        AND remaining.activity_type::text NOT IN (
          'follow_up_no_response',
          'do_not_follow_up',
          'outreach_suppression'
        )
    )
    WHERE id = p_company_id
      AND last_contact_at IS NOT DISTINCT FROM v_activity_at;
  END IF;

  RETURN 'deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_commercial_activity(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_commercial_activity(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_commercial_activity(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_commercial_activity(UUID, UUID) IS
  'Delete one commercial timeline entry. Does not delete follow-ups, contacts, other activities, or the company. Refuses automatic follow-up and suppression history.';

NOTIFY pgrst, 'reload schema';

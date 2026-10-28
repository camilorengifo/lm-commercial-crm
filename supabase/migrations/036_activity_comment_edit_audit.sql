-- Edit commercial timeline comments in place.
-- Updates subject, notes, and (for manual activities) activity_type only.
-- Activity date, company, contact, owner, and follow-up links are not changed,
-- and follow_ups are not inserted or updated.
--
-- Previous and new comments are stored in activity_edit_audits by a trigger.
-- Authenticated users cannot insert, update, or delete those audit rows.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.activity_edit_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  editor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  previous_subject TEXT,
  new_subject TEXT,
  previous_notes TEXT,
  new_notes TEXT,
  previous_activity_type TEXT,
  new_activity_type TEXT,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_edit_audits_activity_id_idx
  ON public.activity_edit_audits (activity_id, edited_at DESC);

CREATE INDEX IF NOT EXISTS activity_edit_audits_company_id_idx
  ON public.activity_edit_audits (company_id, edited_at DESC);

ALTER TABLE public.activity_edit_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.activity_edit_audits FROM PUBLIC;
REVOKE ALL ON TABLE public.activity_edit_audits FROM anon;
REVOKE ALL ON TABLE public.activity_edit_audits FROM authenticated;
GRANT SELECT ON TABLE public.activity_edit_audits TO authenticated;

DROP POLICY IF EXISTS "activity_edit_audits_select_admin"
  ON public.activity_edit_audits;

CREATE POLICY "activity_edit_audits_select_admin"
ON public.activity_edit_audits
FOR SELECT
TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.activity_edit_audits IS
  'Append-only history of commercial timeline comment edits. Ordinary users cannot modify these rows.';

CREATE OR REPLACE FUNCTION public.audit_activity_content_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subject IS NOT DISTINCT FROM OLD.subject
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.activity_type IS NOT DISTINCT FROM OLD.activity_type THEN
    NEW.updated_by := OLD.updated_by;
    RETURN NEW;
  END IF;

  NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);

  INSERT INTO public.activity_edit_audits (
    activity_id,
    company_id,
    editor_user_id,
    previous_subject,
    new_subject,
    previous_notes,
    new_notes,
    previous_activity_type,
    new_activity_type
  ) VALUES (
    OLD.id,
    OLD.company_id,
    auth.uid(),
    OLD.subject,
    NEW.subject,
    OLD.notes,
    NEW.notes,
    OLD.activity_type::text,
    NEW.activity_type::text
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_activity_content_edit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_activity_content_edit() FROM anon;
REVOKE ALL ON FUNCTION public.audit_activity_content_edit() FROM authenticated;

DROP TRIGGER IF EXISTS activities_audit_content_edit ON public.activities;

CREATE TRIGGER activities_audit_content_edit
BEFORE UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.audit_activity_content_edit();

CREATE OR REPLACE FUNCTION public.update_commercial_activity(
  p_activity_id UUID,
  p_company_id UUID,
  p_subject TEXT,
  p_notes TEXT,
  p_activity_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_activity_user_id UUID;
  v_activity_type TEXT;
  v_subject TEXT;
  v_notes TEXT;
  v_next_subject TEXT;
  v_next_notes TEXT;
  v_updated INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  IF p_activity_type IS NULL OR p_activity_type NOT IN (
    'call',
    'email',
    'meeting',
    'visit',
    'note',
    'other',
    'follow_up_no_response',
    'follow_up_rescheduled_contact',
    'do_not_follow_up',
    'outreach_suppression'
  ) THEN
    RAISE EXCEPTION 'Invalid activity type.';
  END IF;

  v_next_notes := trim(COALESCE(p_notes, ''));
  v_next_subject := NULLIF(trim(COALESCE(p_subject, '')), '');

  SELECT
    a.user_id,
    a.activity_type::text,
    a.subject,
    a.notes
  INTO
    v_activity_user_id,
    v_activity_type,
    v_subject,
    v_notes
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
      RAISE EXCEPTION 'You do not have permission to edit this activity.';
    END IF;
  END IF;

  IF p_activity_type IS DISTINCT FROM v_activity_type THEN
    IF v_activity_type IN (
      'follow_up_no_response',
      'follow_up_rescheduled_contact',
      'do_not_follow_up',
      'outreach_suppression'
    ) THEN
      RAISE EXCEPTION 'This activity type cannot be changed.';
    END IF;

    IF p_activity_type NOT IN ('call', 'email', 'meeting', 'visit', 'note', 'other') THEN
      RAISE EXCEPTION 'This activity type cannot be changed.';
    END IF;
  END IF;

  IF v_next_subject IS NOT DISTINCT FROM NULLIF(trim(COALESCE(v_subject, '')), '')
     AND v_next_notes IS NOT DISTINCT FROM trim(COALESCE(v_notes, ''))
     AND p_activity_type IS NOT DISTINCT FROM v_activity_type THEN
    RETURN 'unchanged';
  END IF;

  IF v_next_notes = '' THEN
    RAISE EXCEPTION 'Comment is required.';
  END IF;

  IF char_length(v_next_notes) > 20000 THEN
    RAISE EXCEPTION 'Comment must be 20000 characters or less.';
  END IF;

  IF v_next_subject IS NOT NULL AND char_length(v_next_subject) > 2000 THEN
    RAISE EXCEPTION 'Description must be 2000 characters or less.';
  END IF;

  -- activity_content_columns: subject, notes, activity_type
  UPDATE public.activities
  SET
    subject = v_next_subject,
    notes = v_next_notes,
    activity_type = p_activity_type::public.activity_type
  WHERE id = p_activity_id
    AND company_id = p_company_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'You do not have permission to edit this activity.';
  END IF;

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.update_commercial_activity(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_commercial_activity(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_commercial_activity(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_commercial_activity(UUID, UUID, TEXT, TEXT, TEXT) IS
  'Correct a commercial timeline comment in place. Does not create activities or follow-ups, and does not change date, company, contact, owner, or follow-up links.';

NOTIFY pgrst, 'reload schema';

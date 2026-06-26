-- Account status, pause, and archive management (non-destructive hiding from working lists)

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS account_disposition TEXT,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS archive_reason TEXT,
ADD COLUMN IF NOT EXISTS archive_notes TEXT;

CREATE INDEX IF NOT EXISTS companies_account_status_idx
  ON public.companies (account_status);

UPDATE public.companies
SET account_status = 'active'
WHERE account_status IS NULL OR trim(account_status) = '';

CREATE OR REPLACE FUNCTION public.update_company_account_status(
  p_company_id UUID,
  p_account_status TEXT,
  p_account_disposition TEXT DEFAULT NULL,
  p_archive_reason TEXT DEFAULT NULL,
  p_archive_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
  v_old_status TEXT;
  v_new_status TEXT;
  v_activity_subject TEXT;
  v_activity_notes TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  v_new_status := lower(trim(COALESCE(p_account_status, '')));

  IF v_new_status NOT IN ('active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'Invalid account status';
  END IF;

  SELECT user_id, COALESCE(account_status, 'active')
  INTO v_owner_id, v_old_status
  FROM public.companies
  WHERE id = p_company_id
    AND (public.is_admin() OR deleted_at IS NULL);

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF NOT public.is_admin() AND v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to update this company';
  END IF;

  IF v_new_status = 'archived' THEN
    UPDATE public.companies
    SET
      account_status = 'archived',
      account_disposition = NULLIF(trim(p_account_disposition), ''),
      archived_at = now(),
      archived_by = v_user_id,
      archive_reason = NULLIF(trim(p_archive_reason), ''),
      archive_notes = NULLIF(trim(p_archive_notes), '')
    WHERE id = p_company_id;
  ELSE
    UPDATE public.companies
    SET
      account_status = v_new_status,
      account_disposition = NULLIF(trim(p_account_disposition), ''),
      archived_at = NULL,
      archived_by = NULL,
      archive_reason = CASE
        WHEN v_old_status = 'archived' THEN archive_reason
        ELSE NULLIF(trim(p_archive_reason), '')
      END,
      archive_notes = CASE
        WHEN v_old_status = 'archived' THEN archive_notes
        ELSE NULLIF(trim(p_archive_notes), '')
      END
    WHERE id = p_company_id;
  END IF;

  IF v_old_status = 'archived' AND v_new_status = 'active' THEN
    v_activity_subject := 'Account restored';
    v_activity_notes := 'Account restored to active working status.';
  ELSIF v_new_status = 'archived' AND v_old_status <> 'archived' THEN
    v_activity_subject := 'Account archived';
    v_activity_notes := 'Account archived and hidden from the default working list.';
  ELSIF v_new_status = 'paused' AND v_old_status <> 'paused' THEN
    v_activity_subject := 'Account paused';
    v_activity_notes := 'Account paused.';
  ELSIF v_new_status <> v_old_status THEN
    v_activity_subject := 'Account status changed';
    v_activity_notes := format(
      'Account status changed from %s to %s.',
      initcap(v_old_status),
      initcap(v_new_status)
    );
  ELSE
    v_activity_subject := 'Account status updated';
    v_activity_notes := 'Account status details updated.';
  END IF;

  IF NULLIF(trim(p_archive_reason), '') IS NOT NULL THEN
    v_activity_notes := v_activity_notes || ' Reason: ' || trim(p_archive_reason);
  END IF;

  IF NULLIF(trim(p_archive_notes), '') IS NOT NULL THEN
    v_activity_notes := v_activity_notes || ' Notes: ' || trim(p_archive_notes);
  END IF;

  IF NULLIF(trim(p_account_disposition), '') IS NOT NULL THEN
    v_activity_notes := v_activity_notes || ' Disposition: ' || trim(p_account_disposition);
  END IF;

  INSERT INTO public.activities (
    user_id,
    company_id,
    activity_type,
    subject,
    notes,
    activity_at
  )
  VALUES (
    v_owner_id,
    p_company_id,
    'note',
    v_activity_subject,
    v_activity_notes,
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_company_account_status(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Company soft delete, delete protection, and user blocking

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS companies_deleted_at_idx ON public.companies (deleted_at);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE TABLE IF NOT EXISTS public.company_delete_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  company_count INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  blocked BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_delete_events_user_id_idx
  ON public.company_delete_events (user_id);

CREATE INDEX IF NOT EXISTS company_delete_events_created_at_idx
  ON public.company_delete_events (created_at DESC);

ALTER TABLE public.company_delete_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_delete_events_select_admin"
ON public.company_delete_events
FOR SELECT
USING (public.is_admin());

-- Brokers only see active companies they own.
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;

CREATE POLICY "companies_select_own"
ON public.companies
FOR SELECT
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
);

CREATE OR REPLACE FUNCTION public.is_profile_blocked(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_blocked
      FROM public.profiles
      WHERE id = p_user_id
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.archive_companies_safely(
  p_company_ids UUID[],
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_requested INTEGER;
  v_owned_active INTEGER;
  v_active_total INTEGER;
  v_recent_attempts INTEGER;
  v_company_id UUID;
  v_archived INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed JSONB := '[]'::JSONB;
  v_threshold_pct NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.is_admin();

  IF public.is_profile_blocked(v_user_id) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  IF p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one company ID is required';
  END IF;

  v_requested := array_length(p_company_ids, 1);

  IF NOT v_is_admin THEN
    SELECT COUNT(*) INTO v_owned_active
    FROM public.companies
    WHERE id = ANY (p_company_ids)
      AND user_id = v_user_id
      AND deleted_at IS NULL;

    IF v_owned_active <> v_requested THEN
      RAISE EXCEPTION 'One or more companies were not found or are not owned by you';
    END IF;

    SELECT COUNT(*) INTO v_active_total
    FROM public.companies
    WHERE user_id = v_user_id
      AND deleted_at IS NULL;

    SELECT COALESCE(SUM(company_count), 0) INTO v_recent_attempts
    FROM public.company_delete_events
    WHERE user_id = v_user_id
      AND action IN ('archive', 'archive_attempt', 'archive_blocked')
      AND created_at > now() - interval '10 minutes';

    IF v_requested >= 10 THEN
      PERFORM public._block_user_for_delete_abuse(
        v_user_id,
        p_company_ids,
        p_reason,
        'Attempted to archive 10 or more companies in one action'
      );
      RAISE EXCEPTION 'This action was blocked for security reasons. Please contact an administrator.';
    END IF;

    IF v_active_total > 0 THEN
      v_threshold_pct := (v_requested::NUMERIC / v_active_total::NUMERIC) * 100;
      IF v_threshold_pct > 30 THEN
        PERFORM public._block_user_for_delete_abuse(
          v_user_id,
          p_company_ids,
          p_reason,
          'Attempted to archive more than 30% of active companies in one action'
        );
        RAISE EXCEPTION 'This action was blocked for security reasons. Please contact an administrator.';
      END IF;
    END IF;

    IF (v_recent_attempts + v_requested) >= 5 THEN
      PERFORM public._block_user_for_delete_abuse(
        v_user_id,
        p_company_ids,
        p_reason,
        'Attempted to archive 5 or more companies within 10 minutes'
      );
      RAISE EXCEPTION 'This action was blocked for security reasons. Please contact an administrator.';
    END IF;

    IF v_active_total > 0 AND v_requested >= GREATEST(v_active_total - 1, 1)
       AND v_active_total <= 10 THEN
      PERFORM public._block_user_for_delete_abuse(
        v_user_id,
        p_company_ids,
        p_reason,
        'Attempted to archive nearly all active companies'
      );
      RAISE EXCEPTION 'This action was blocked for security reasons. Please contact an administrator.';
    END IF;
  END IF;

  FOREACH v_company_id IN ARRAY p_company_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.companies
      WHERE id = v_company_id
        AND deleted_at IS NULL
        AND (v_is_admin OR user_id = v_user_id)
    ) THEN
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'companyId', v_company_id,
          'error', 'Company not found or already archived'
        )
      );
      CONTINUE;
    END IF;

    UPDATE public.companies
    SET
      deleted_at = now(),
      deleted_by = v_user_id,
      delete_reason = NULLIF(trim(p_reason), '')
    WHERE id = v_company_id
      AND deleted_at IS NULL;

    INSERT INTO public.activities (
      user_id,
      company_id,
      activity_type,
      subject,
      notes,
      activity_at
    )
    SELECT
      c.user_id,
      c.id,
      'note',
      'Company archived',
      CASE
        WHEN v_is_admin THEN 'Company archived by admin.'
        ELSE 'Company archived by user.'
      END || COALESCE(' Reason: ' || NULLIF(trim(p_reason), ''), ''),
      now()
    FROM public.companies c
    WHERE c.id = v_company_id;

    v_archived := v_archived + 1;
  END LOOP;

  INSERT INTO public.company_delete_events (
    user_id,
    company_id,
    action,
    company_count,
    reason,
    blocked,
    metadata
  )
  VALUES (
    v_user_id,
    NULL,
    'archive',
    v_archived,
    NULLIF(trim(p_reason), ''),
    false,
    jsonb_build_object(
      'requested', v_requested,
      'archived', v_archived,
      'skipped', v_skipped,
      'isAdmin', v_is_admin
    )
  );

  RETURN jsonb_build_object(
    'success', jsonb_array_length(v_failed) = 0,
    'archived', v_archived,
    'skipped', v_skipped,
    'failed', v_failed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._block_user_for_delete_abuse(
  p_user_id UUID,
  p_company_ids UUID[],
  p_reason TEXT,
  p_block_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN;
  END IF;

  INSERT INTO public.company_delete_events (
    user_id,
    company_id,
    action,
    company_count,
    reason,
    blocked,
    metadata
  )
  VALUES (
    p_user_id,
    NULL,
    'archive_blocked',
    COALESCE(array_length(p_company_ids, 1), 0),
    NULLIF(trim(p_reason), ''),
    true,
    jsonb_build_object('blockReason', p_block_reason)
  );

  UPDATE public.profiles
  SET
    is_blocked = true,
    blocked_at = now(),
    blocked_reason = 'Suspicious bulk company deletion attempt.'
  WHERE id = p_user_id
    AND role <> 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_companies(
  p_company_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_restored INTEGER := 0;
  v_failed JSONB := '[]'::JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can restore archived companies';
  END IF;

  IF p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one company ID is required';
  END IF;

  FOREACH v_company_id IN ARRAY p_company_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.companies
      WHERE id = v_company_id
        AND deleted_at IS NOT NULL
    ) THEN
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'companyId', v_company_id,
          'error', 'Company not found or not archived'
        )
      );
      CONTINUE;
    END IF;

    UPDATE public.companies
    SET
      deleted_at = NULL,
      deleted_by = NULL,
      delete_reason = NULL
    WHERE id = v_company_id;

    INSERT INTO public.activities (
      user_id,
      company_id,
      activity_type,
      subject,
      notes,
      activity_at
    )
    SELECT
      c.user_id,
      c.id,
      'note',
      'Company restored',
      'Company restored by admin.',
      now()
    FROM public.companies c
    WHERE c.id = v_company_id;

    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', jsonb_array_length(v_failed) = 0,
    'restored', v_restored,
    'failed', v_failed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_company_details(
  p_company_id UUID,
  p_name TEXT,
  p_city TEXT,
  p_state TEXT,
  p_country TEXT,
  p_priority company_priority,
  p_general_notes TEXT,
  p_last_contact_at TIMESTAMPTZ,
  p_next_follow_up_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_profile_blocked(v_user_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Your account has been temporarily blocked. Please contact an administrator.';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  SELECT user_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id
    AND (public.is_admin() OR deleted_at IS NULL);

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF NOT public.is_admin() AND v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'You do not have permission to edit this company';
  END IF;

  UPDATE public.companies
  SET
    name = trim(p_name),
    city = NULLIF(trim(p_city), ''),
    state = NULLIF(trim(p_state), ''),
    country = NULLIF(trim(p_country), ''),
    priority = p_priority,
    general_notes = NULLIF(trim(p_general_notes), ''),
    last_contact_at = p_last_contact_at,
    next_follow_up_at = p_next_follow_up_at
  WHERE id = p_company_id;

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
    'Company details updated',
    'Company details updated.',
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_companies_safely(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_companies(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_details(
  UUID, TEXT, TEXT, TEXT, TEXT, company_priority, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated;

NOTIFY pgrst, 'reload schema';

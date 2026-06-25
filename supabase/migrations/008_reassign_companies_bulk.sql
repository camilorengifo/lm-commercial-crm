-- Bulk company ownership reassignment (admin only)
-- Requires: public.is_admin() from 005_user_roles.sql
-- Requires: public.reassign_company_owner(UUID, UUID) from 005 (updated below)

CREATE OR REPLACE FUNCTION public.reassign_company_owner(
  p_company_id UUID,
  p_new_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_user_id UUID;
  v_new_email TEXT;
  v_old_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign company ownership';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_new_user_id
      AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Target user profile not found or inactive';
  END IF;

  SELECT user_id INTO v_old_user_id
  FROM public.companies
  WHERE id = p_company_id;

  IF v_old_user_id IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF v_old_user_id = p_new_user_id THEN
    RETURN;
  END IF;

  SELECT email INTO v_new_email FROM public.profiles WHERE id = p_new_user_id;
  SELECT email INTO v_old_email FROM public.profiles WHERE id = v_old_user_id;

  UPDATE public.companies
  SET user_id = p_new_user_id
  WHERE id = p_company_id;

  UPDATE public.contacts
  SET user_id = p_new_user_id
  WHERE company_id = p_company_id;

  UPDATE public.activities
  SET user_id = p_new_user_id
  WHERE company_id = p_company_id;

  UPDATE public.follow_ups
  SET user_id = p_new_user_id
  WHERE company_id = p_company_id;

  UPDATE public.load_opportunities
  SET user_id = p_new_user_id
  WHERE company_id = p_company_id;

  UPDATE public.company_ai_insights
  SET user_id = p_new_user_id
  WHERE company_id = p_company_id;

  INSERT INTO public.activities (
    user_id,
    company_id,
    activity_type,
    subject,
    notes,
    activity_at
  )
  VALUES (
    p_new_user_id,
    p_company_id,
    'note',
    'Company ownership reassigned',
    format(
      'Admin reassigned this account from %s to %s.',
      COALESCE(v_old_email, v_old_user_id::text),
      COALESCE(v_new_email, p_new_user_id::text)
    ),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign_companies_owner(
  p_company_ids UUID[],
  p_new_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_old_user_id UUID;
  v_reassigned INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign company ownership';
  END IF;

  IF p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one company ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_new_user_id
      AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Target user profile not found or inactive';
  END IF;

  FOREACH v_company_id IN ARRAY p_company_ids LOOP
    SELECT user_id INTO v_old_user_id
    FROM public.companies
    WHERE id = v_company_id;

    IF v_old_user_id IS NULL THEN
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'companyId', v_company_id,
          'error', 'Company not found'
        )
      );
      CONTINUE;
    END IF;

    IF v_old_user_id = p_new_user_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.reassign_company_owner(v_company_id, p_new_user_id);
      v_reassigned := v_reassigned + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed || jsonb_build_array(
          jsonb_build_object(
            'companyId', v_company_id,
            'error', SQLERRM
          )
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_failed = '[]'::JSONB,
    'reassigned', v_reassigned,
    'skipped', v_skipped,
    'failed', v_failed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_company_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_companies_owner(UUID[], UUID) TO authenticated;

COMMENT ON FUNCTION public.reassign_companies_owner(UUID[], UUID) IS
  'Admin-only bulk reassignment of company ownership and related CRM records.';

-- Refresh PostgREST schema cache so Supabase API sees the new RPC immediately.
NOTIFY pgrst, 'reload schema';

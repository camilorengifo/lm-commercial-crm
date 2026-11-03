-- Main company phone number.
-- Stored on companies.main_phone and kept separate from contacts.phone.
-- Nullable so existing companies continue to work with no phone number.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS main_phone TEXT;

-- PostgreSQL cannot change a function's argument list with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.update_company_details(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  company_priority,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.update_company_details(
  p_company_id UUID,
  p_name TEXT,
  p_city TEXT,
  p_state TEXT,
  p_country TEXT,
  p_priority company_priority,
  p_general_notes TEXT,
  p_last_contact_at TIMESTAMPTZ,
  p_next_follow_up_at TIMESTAMPTZ,
  p_main_phone TEXT
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
    next_follow_up_at = p_next_follow_up_at,
    main_phone = NULLIF(trim(p_main_phone), '')
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

GRANT EXECUTE ON FUNCTION public.update_company_details(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  company_priority,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';

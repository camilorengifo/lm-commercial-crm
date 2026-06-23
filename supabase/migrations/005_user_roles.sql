-- User roles (admin / broker) and admin RLS access

CREATE TYPE public.user_role AS ENUM ('admin', 'broker');

ALTER TABLE public.profiles
ADD COLUMN role public.user_role NOT NULL DEFAULT 'broker';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'broker'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Promote initial admin (safe if user does not exist yet)
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = lower('camilo@armstrongtransport.com');

-- Admin read access
CREATE POLICY "profiles_select_admin"
ON public.profiles
FOR SELECT
USING (public.is_admin());

CREATE POLICY "companies_select_admin"
ON public.companies
FOR SELECT
USING (public.is_admin());

CREATE POLICY "companies_update_admin"
ON public.companies
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "contacts_select_admin"
ON public.contacts
FOR SELECT
USING (public.is_admin());

CREATE POLICY "activities_select_admin"
ON public.activities
FOR SELECT
USING (public.is_admin());

CREATE POLICY "activities_insert_admin"
ON public.activities
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_select_admin"
ON public.follow_ups
FOR SELECT
USING (public.is_admin());

CREATE POLICY "load_opportunities_select_admin"
ON public.load_opportunities
FOR SELECT
USING (public.is_admin());

CREATE POLICY "company_ai_insights_select_admin"
ON public.company_ai_insights
FOR SELECT
USING (public.is_admin());

CREATE POLICY "broker_reminder_logs_select_admin"
ON public.broker_reminder_logs
FOR SELECT
USING (public.is_admin());

-- Reassign company ownership (admin only)
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
  v_admin_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign company ownership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_new_user_id
  ) THEN
    RAISE EXCEPTION 'Target broker profile not found';
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
  SELECT email INTO v_admin_email FROM public.profiles WHERE id = auth.uid();

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
      'Ownership changed from %s to %s (%s) by admin %s.',
      v_old_user_id,
      p_new_user_id,
      COALESCE(v_new_email, 'unknown email'),
      COALESCE(v_admin_email, auth.uid()::text)
    ),
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_company_owner(UUID, UUID) TO authenticated;

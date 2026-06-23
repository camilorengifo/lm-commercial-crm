-- Profile active status and admin profile management

ALTER TABLE public.profiles
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role := 'broker';
  v_role_text TEXT;
BEGIN
  v_role_text := lower(COALESCE(NEW.raw_user_meta_data ->> 'role', 'broker'));
  IF v_role_text = 'admin' THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    v_role,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE POLICY "profiles_update_admin"
ON public.profiles
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

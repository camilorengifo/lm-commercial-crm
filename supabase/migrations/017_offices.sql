-- Offices / agencies for broker assignment and admin reporting

CREATE TABLE IF NOT EXISTS public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS offices_name_unique_idx
  ON public.offices (name);

CREATE TRIGGER offices_set_updated_at
BEFORE UPDATE ON public.offices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.offices (name, city)
VALUES
  ('GR Logistics Masters - Medellin', 'Medellin'),
  ('M&M - Medellin', 'Medellin'),
  ('Barranquilla', 'Barranquilla'),
  ('Bogota', 'Bogota')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_office_id_idx
  ON public.profiles (office_id);

ALTER TABLE public.user_invitations
ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;

ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offices_select_authenticated"
ON public.offices
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "offices_insert_admin"
ON public.offices
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "offices_update_admin"
ON public.offices
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "offices_delete_admin"
ON public.offices
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_profile_office_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    NEW.office_id := OLD.office_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_office_id ON public.profiles;

CREATE TRIGGER profiles_protect_office_id
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_office_assignment();

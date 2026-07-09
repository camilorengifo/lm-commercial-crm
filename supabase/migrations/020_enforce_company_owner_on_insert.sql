-- Force new companies to belong to the authenticated user on insert.
-- Admins reassign ownership through public.reassign_company_owner().

CREATE OR REPLACE FUNCTION public.enforce_company_owner_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  NEW.user_id := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_owner_before_insert ON public.companies;

CREATE TRIGGER enforce_company_owner_before_insert
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.enforce_company_owner_on_insert();

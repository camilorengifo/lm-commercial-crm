-- Align follow_ups.user_id with canonical company owner (companies.user_id).
-- Repairs historical drift where follow-up assignee diverged from company owner.

UPDATE public.follow_ups AS follow_up
SET user_id = company.user_id
FROM public.companies AS company
WHERE company.id = follow_up.company_id
  AND follow_up.user_id IS DISTINCT FROM company.user_id;

CREATE OR REPLACE FUNCTION public.sync_follow_ups_to_company_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    UPDATE public.follow_ups
    SET user_id = NEW.user_id
    WHERE company_id = NEW.id
      AND user_id IS DISTINCT FROM NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_follow_ups_to_company_owner_trigger ON public.companies;

CREATE TRIGGER sync_follow_ups_to_company_owner_trigger
AFTER UPDATE OF user_id ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.sync_follow_ups_to_company_owner();

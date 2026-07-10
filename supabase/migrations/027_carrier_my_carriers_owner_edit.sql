-- Allow My Carriers owners to update shared carrier records they are linked to.
-- Admins retain network-wide edit access. API routes also enforce page context.

CREATE OR REPLACE FUNCTION public.user_owns_carrier_relationship(p_carrier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_carriers uc
    WHERE uc.user_id = auth.uid()
      AND uc.carrier_id = p_carrier_id
  );
$$;

CREATE OR REPLACE FUNCTION public.carriers_enforce_status_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can delete shared carriers';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin()
      AND NOT public.user_owns_carrier_relationship(NEW.id) THEN
      RAISE EXCEPTION 'Only admins or My Carriers owners can update shared carrier records';
    END IF;

    IF NEW.status = 'do_not_use' AND OLD.status IS DISTINCT FROM 'do_not_use' THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can mark a carrier as Do Not Use';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'do_not_use' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can create a carrier with Do Not Use status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- carriers
DROP POLICY IF EXISTS carriers_update_admin ON public.carriers;

CREATE POLICY carriers_update_admin_or_owner
ON public.carriers FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(id)
)
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(id)
);

-- carrier_services
DROP POLICY IF EXISTS carrier_services_insert_admin ON public.carrier_services;
DROP POLICY IF EXISTS carrier_services_update_admin ON public.carrier_services;
DROP POLICY IF EXISTS carrier_services_delete_admin ON public.carrier_services;

CREATE POLICY carrier_services_insert_admin_or_owner
ON public.carrier_services FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_services_update_admin_or_owner
ON public.carrier_services FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
)
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_services_delete_admin_or_owner
ON public.carrier_services FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

-- carrier_equipment
DROP POLICY IF EXISTS carrier_equipment_insert_admin ON public.carrier_equipment;
DROP POLICY IF EXISTS carrier_equipment_update_admin ON public.carrier_equipment;
DROP POLICY IF EXISTS carrier_equipment_delete_admin ON public.carrier_equipment;

CREATE POLICY carrier_equipment_insert_admin_or_owner
ON public.carrier_equipment FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_equipment_update_admin_or_owner
ON public.carrier_equipment FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
)
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_equipment_delete_admin_or_owner
ON public.carrier_equipment FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

-- carrier_service_areas
DROP POLICY IF EXISTS carrier_service_areas_insert_admin ON public.carrier_service_areas;
DROP POLICY IF EXISTS carrier_service_areas_update_admin ON public.carrier_service_areas;
DROP POLICY IF EXISTS carrier_service_areas_delete_admin ON public.carrier_service_areas;

CREATE POLICY carrier_service_areas_insert_admin_or_owner
ON public.carrier_service_areas FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_service_areas_update_admin_or_owner
ON public.carrier_service_areas FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
)
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_service_areas_delete_admin_or_owner
ON public.carrier_service_areas FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

-- carrier_contacts
DROP POLICY IF EXISTS carrier_contacts_insert_admin ON public.carrier_contacts;
DROP POLICY IF EXISTS carrier_contacts_update_admin ON public.carrier_contacts;
DROP POLICY IF EXISTS carrier_contacts_delete_admin ON public.carrier_contacts;

CREATE POLICY carrier_contacts_insert_admin_or_owner
ON public.carrier_contacts FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_contacts_update_admin_or_owner
ON public.carrier_contacts FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
)
WITH CHECK (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

CREATE POLICY carrier_contacts_delete_admin_or_owner
ON public.carrier_contacts FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_carrier_relationship(carrier_id)
);

NOTIFY pgrst, 'reload schema';

-- Shared carrier master directory + per-user relationships

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_carrier_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    trim(
      regexp_replace(
        regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_carrier_mc(p_mc TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(upper(trim(coalesce(p_mc, ''))), '[^0-9]', '', 'g'),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_carrier_dot(p_dot TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(upper(trim(coalesce(p_dot, ''))), '[^0-9]', '', 'g'),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_carrier_scac(p_scac TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(upper(trim(coalesce(p_scac, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_carrier_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.carriers_set_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_name := public.normalize_carrier_name(NEW.legal_name);
  RETURN NEW;
END;
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

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  normalized_name TEXT,
  dba_name TEXT,
  mc_number TEXT,
  dot_number TEXT,
  scac TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  is_bonded BOOLEAN NOT NULL DEFAULT false,
  is_hazmat BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carriers_status_check CHECK (
    status IN ('pending_verification', 'active', 'inactive', 'do_not_use')
  )
);

CREATE TRIGGER carriers_set_normalized_name
BEFORE INSERT OR UPDATE OF legal_name ON public.carriers
FOR EACH ROW
EXECUTE FUNCTION public.carriers_set_normalized_name();

CREATE TRIGGER carriers_set_updated_at
BEFORE UPDATE ON public.carriers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER carriers_enforce_status_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.carriers
FOR EACH ROW
EXECUTE FUNCTION public.carriers_enforce_status_permissions();

CREATE INDEX carriers_normalized_name_idx ON public.carriers (normalized_name);
CREATE INDEX carriers_mc_number_idx ON public.carriers (mc_number) WHERE mc_number IS NOT NULL;
CREATE INDEX carriers_dot_number_idx ON public.carriers (dot_number) WHERE dot_number IS NOT NULL;
CREATE INDEX carriers_scac_idx ON public.carriers (scac) WHERE scac IS NOT NULL;
CREATE INDEX carriers_is_bonded_idx ON public.carriers (is_bonded);
CREATE INDEX carriers_is_hazmat_idx ON public.carriers (is_hazmat);
CREATE INDEX carriers_status_idx ON public.carriers (status);
CREATE INDEX carriers_legal_name_idx ON public.carriers (legal_name);

CREATE TABLE public.carrier_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers (id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carrier_services_type_check CHECK (
    service_type IN ('ftl', 'ltl', 'drayage', 'heavy_haul')
  ),
  CONSTRAINT carrier_services_unique UNIQUE (carrier_id, service_type)
);

CREATE INDEX carrier_services_carrier_id_idx ON public.carrier_services (carrier_id);
CREATE INDEX carrier_services_type_idx ON public.carrier_services (service_type);

CREATE TABLE public.carrier_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers (id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carrier_equipment_type_check CHECK (
    equipment_type IN (
      'dry_van',
      'reefer',
      'flatbed',
      'step_deck',
      'conestoga',
      'power_only',
      'box_truck',
      'straight_truck',
      'sprinter_van',
      'lowboy',
      'rgn',
      'tanker',
      'intermodal'
    )
  ),
  CONSTRAINT carrier_equipment_unique UNIQUE (carrier_id, equipment_type)
);

CREATE INDEX carrier_equipment_carrier_id_idx ON public.carrier_equipment (carrier_id);
CREATE INDEX carrier_equipment_type_idx ON public.carrier_equipment (equipment_type);

CREATE TABLE public.carrier_service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers (id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  state TEXT,
  city TEXT,
  service_radius_miles INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carrier_service_areas_radius_check CHECK (
    service_radius_miles IS NULL OR service_radius_miles > 0
  )
);

CREATE INDEX carrier_service_areas_carrier_id_idx ON public.carrier_service_areas (carrier_id);
CREATE INDEX carrier_service_areas_country_idx ON public.carrier_service_areas (country);
CREATE INDEX carrier_service_areas_state_idx ON public.carrier_service_areas (state);
CREATE INDEX carrier_service_areas_city_idx ON public.carrier_service_areas (city);

CREATE TRIGGER carrier_service_areas_set_updated_at
BEFORE UPDATE ON public.carrier_service_areas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.carrier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX carrier_contacts_carrier_id_idx ON public.carrier_contacts (carrier_id);

CREATE TRIGGER carrier_contacts_set_updated_at
BEFORE UPDATE ON public.carrier_contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.carriers (id) ON DELETE CASCADE,
  private_notes TEXT,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  relationship_status TEXT,
  last_contacted_at TIMESTAMPTZ,
  preferred_contact_id UUID REFERENCES public.carrier_contacts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_carriers_unique UNIQUE (user_id, carrier_id)
);

CREATE INDEX user_carriers_user_id_idx ON public.user_carriers (user_id);
CREATE INDEX user_carriers_carrier_id_idx ON public.user_carriers (carrier_id);
CREATE INDEX user_carriers_is_preferred_idx ON public.user_carriers (is_preferred);

CREATE TRIGGER user_carriers_set_updated_at
BEFORE UPDATE ON public.user_carriers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.carrier_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_services FORCE ROW LEVEL SECURITY;

ALTER TABLE public.carrier_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_equipment FORCE ROW LEVEL SECURITY;

ALTER TABLE public.carrier_service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_service_areas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.carrier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_contacts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_carriers FORCE ROW LEVEL SECURITY;

-- carriers: shared read/create/update for authenticated users; delete admin-only (trigger)
CREATE POLICY carriers_select_authenticated
ON public.carriers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY carriers_insert_authenticated
ON public.carriers FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY carriers_update_authenticated
ON public.carriers FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- carrier child tables: shared directory data
CREATE POLICY carrier_services_select_authenticated
ON public.carrier_services FOR SELECT TO authenticated USING (true);
CREATE POLICY carrier_services_insert_authenticated
ON public.carrier_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY carrier_services_update_authenticated
ON public.carrier_services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY carrier_services_delete_authenticated
ON public.carrier_services FOR DELETE TO authenticated USING (true);

CREATE POLICY carrier_equipment_select_authenticated
ON public.carrier_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY carrier_equipment_insert_authenticated
ON public.carrier_equipment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY carrier_equipment_update_authenticated
ON public.carrier_equipment FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY carrier_equipment_delete_authenticated
ON public.carrier_equipment FOR DELETE TO authenticated USING (true);

CREATE POLICY carrier_service_areas_select_authenticated
ON public.carrier_service_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY carrier_service_areas_insert_authenticated
ON public.carrier_service_areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY carrier_service_areas_update_authenticated
ON public.carrier_service_areas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY carrier_service_areas_delete_authenticated
ON public.carrier_service_areas FOR DELETE TO authenticated USING (true);

CREATE POLICY carrier_contacts_select_authenticated
ON public.carrier_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY carrier_contacts_insert_authenticated
ON public.carrier_contacts FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY carrier_contacts_update_authenticated
ON public.carrier_contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY carrier_contacts_delete_authenticated
ON public.carrier_contacts FOR DELETE TO authenticated USING (true);

-- user_carriers: private per-user relationship
CREATE POLICY user_carriers_select_own
ON public.user_carriers FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY user_carriers_insert_own
ON public.user_carriers FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY user_carriers_update_own
ON public.user_carriers FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY user_carriers_delete_own
ON public.user_carriers FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin merge / archive helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_archive_carrier(p_carrier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can archive carriers';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.carriers WHERE id = p_carrier_id) THEN
    RAISE EXCEPTION 'Carrier not found';
  END IF;

  SELECT count(*)::INTEGER INTO v_link_count
  FROM public.user_carriers
  WHERE carrier_id = p_carrier_id;

  UPDATE public.carriers
  SET status = 'inactive', updated_by = auth.uid(), updated_at = now()
  WHERE id = p_carrier_id;

  RETURN jsonb_build_object(
    'carrier_id', p_carrier_id,
    'status', 'inactive',
    'linked_users', v_link_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_merge_carriers(
  p_source_carrier_id UUID,
  p_target_carrier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved_links INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge carriers';
  END IF;

  IF p_source_carrier_id = p_target_carrier_id THEN
    RAISE EXCEPTION 'Source and target carrier must differ';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.carriers WHERE id = p_source_carrier_id) THEN
    RAISE EXCEPTION 'Source carrier not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.carriers WHERE id = p_target_carrier_id) THEN
    RAISE EXCEPTION 'Target carrier not found';
  END IF;

  -- Re-point user links that do not already exist on target
  UPDATE public.user_carriers uc
  SET carrier_id = p_target_carrier_id, updated_at = now()
  WHERE uc.carrier_id = p_source_carrier_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_carriers existing
      WHERE existing.user_id = uc.user_id
        AND existing.carrier_id = p_target_carrier_id
    );
  GET DIAGNOSTICS v_moved_links = ROW_COUNT;

  DELETE FROM public.user_carriers
  WHERE carrier_id = p_source_carrier_id;

  -- Merge child rows (ignore duplicates via unique constraints)
  INSERT INTO public.carrier_services (carrier_id, service_type)
  SELECT p_target_carrier_id, service_type
  FROM public.carrier_services
  WHERE carrier_id = p_source_carrier_id
  ON CONFLICT (carrier_id, service_type) DO NOTHING;

  INSERT INTO public.carrier_equipment (carrier_id, equipment_type)
  SELECT p_target_carrier_id, equipment_type
  FROM public.carrier_equipment
  WHERE carrier_id = p_source_carrier_id
  ON CONFLICT (carrier_id, equipment_type) DO NOTHING;

  INSERT INTO public.carrier_service_areas (
    carrier_id, country, state, city, service_radius_miles
  )
  SELECT p_target_carrier_id, country, state, city, service_radius_miles
  FROM public.carrier_service_areas
  WHERE carrier_id = p_source_carrier_id;

  INSERT INTO public.carrier_contacts (
    carrier_id, name, role, phone, email, is_primary, created_by
  )
  SELECT p_target_carrier_id, name, role, phone, email, is_primary, created_by
  FROM public.carrier_contacts
  WHERE carrier_id = p_source_carrier_id;

  DELETE FROM public.carriers WHERE id = p_source_carrier_id;

  UPDATE public.carriers
  SET updated_by = auth.uid(), updated_at = now()
  WHERE id = p_target_carrier_id;

  RETURN jsonb_build_object(
    'source_carrier_id', p_source_carrier_id,
    'target_carrier_id', p_target_carrier_id,
    'moved_user_links', v_moved_links
  );
END;
$$;

-- Broker create: SECURITY DEFINER bundle for Add Carrier flow
CREATE OR REPLACE FUNCTION public.create_carrier_with_children(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_carrier_id UUID;
  v_status TEXT;
  v_service_type TEXT;
  v_equipment_type TEXT;
  v_area JSONB;
  v_contact JSONB;
  v_country TEXT;
  v_radius INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF COALESCE(trim(p_payload->>'legal_name'), '') = '' THEN
    RAISE EXCEPTION 'Legal carrier name is required';
  END IF;

  v_status := COALESCE(NULLIF(trim(p_payload->>'status'), ''), 'pending_verification');
  IF v_status NOT IN ('pending_verification', 'active', 'inactive', 'do_not_use') THEN
    RAISE EXCEPTION 'Invalid carrier status';
  END IF;

  IF v_status = 'do_not_use' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create a carrier with Do Not Use status';
  END IF;

  INSERT INTO public.carriers (
    legal_name,
    normalized_name,
    dba_name,
    mc_number,
    dot_number,
    scac,
    phone,
    email,
    website,
    is_bonded,
    is_hazmat,
    status,
    created_by,
    updated_by
  ) VALUES (
    trim(p_payload->>'legal_name'),
    public.normalize_carrier_name(p_payload->>'legal_name'),
    nullif(trim(coalesce(p_payload->>'dba_name', '')), ''),
    public.normalize_carrier_mc(p_payload->>'mc_number'),
    public.normalize_carrier_dot(p_payload->>'dot_number'),
    public.normalize_carrier_scac(p_payload->>'scac'),
    nullif(trim(coalesce(p_payload->>'phone', '')), ''),
    nullif(lower(trim(coalesce(p_payload->>'email', ''))), ''),
    nullif(trim(coalesce(p_payload->>'website', '')), ''),
    COALESCE((p_payload->>'is_bonded')::BOOLEAN, false),
    COALESCE((p_payload->>'is_hazmat')::BOOLEAN, false),
    v_status,
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_carrier_id;

  IF p_payload ? 'service_types' AND jsonb_typeof(p_payload->'service_types') = 'array' THEN
    FOR v_service_type IN
      SELECT jsonb_array_elements_text(p_payload->'service_types')
    LOOP
      IF v_service_type IN ('ftl', 'ltl', 'drayage', 'heavy_haul') THEN
        INSERT INTO public.carrier_services (carrier_id, service_type)
        VALUES (v_carrier_id, v_service_type)
        ON CONFLICT (carrier_id, service_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'equipment_types' AND jsonb_typeof(p_payload->'equipment_types') = 'array' THEN
    FOR v_equipment_type IN
      SELECT jsonb_array_elements_text(p_payload->'equipment_types')
    LOOP
      IF v_equipment_type IN (
        'dry_van', 'reefer', 'flatbed', 'step_deck', 'conestoga', 'power_only',
        'box_truck', 'straight_truck', 'sprinter_van', 'lowboy', 'rgn', 'tanker',
        'intermodal'
      ) THEN
        INSERT INTO public.carrier_equipment (carrier_id, equipment_type)
        VALUES (v_carrier_id, v_equipment_type)
        ON CONFLICT (carrier_id, equipment_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'service_areas' AND jsonb_typeof(p_payload->'service_areas') = 'array' THEN
    FOR v_area IN SELECT jsonb_array_elements(p_payload->'service_areas')
    LOOP
      v_country := nullif(trim(coalesce(v_area->>'country', '')), '');
      IF v_country IS NULL THEN
        CONTINUE;
      END IF;

      v_radius := NULL;
      IF coalesce(v_area->>'service_radius_miles', '') ~ '^[0-9]+$' THEN
        v_radius := (v_area->>'service_radius_miles')::INTEGER;
        IF v_radius <= 0 THEN
          v_radius := NULL;
        END IF;
      ELSIF jsonb_typeof(v_area->'service_radius_miles') = 'number' THEN
        v_radius := (v_area->>'service_radius_miles')::INTEGER;
        IF v_radius <= 0 THEN
          v_radius := NULL;
        END IF;
      END IF;

      INSERT INTO public.carrier_service_areas (
        carrier_id, country, state, city, service_radius_miles
      ) VALUES (
        v_carrier_id,
        v_country,
        nullif(trim(coalesce(v_area->>'state', '')), ''),
        nullif(trim(coalesce(v_area->>'city', '')), ''),
        v_radius
      );
    END LOOP;
  END IF;

  IF p_payload ? 'contacts' AND jsonb_typeof(p_payload->'contacts') = 'array' THEN
    FOR v_contact IN SELECT jsonb_array_elements(p_payload->'contacts')
    LOOP
      IF coalesce(trim(v_contact->>'name'), '') = '' THEN
        CONTINUE;
      END IF;

      INSERT INTO public.carrier_contacts (
        carrier_id, name, role, phone, email, is_primary, created_by
      ) VALUES (
        v_carrier_id,
        trim(v_contact->>'name'),
        nullif(trim(coalesce(v_contact->>'role', '')), ''),
        nullif(trim(coalesce(v_contact->>'phone', '')), ''),
        nullif(lower(trim(coalesce(v_contact->>'email', ''))), ''),
        COALESCE((v_contact->>'is_primary')::BOOLEAN, false),
        v_user_id
      );
    END LOOP;
  END IF;

  IF COALESCE((p_payload->>'link_to_user')::BOOLEAN, true) THEN
    INSERT INTO public.user_carriers (user_id, carrier_id)
    VALUES (v_user_id, v_carrier_id)
    ON CONFLICT (user_id, carrier_id) DO NOTHING;
  END IF;

  RETURN v_carrier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_archive_carrier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_carriers(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.create_carrier_with_children(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_carrier_with_children(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_carrier_with_children(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_carrier_with_children(JSONB) IS
  'Creates a shared carrier with child rows and links it to the caller''s My Carriers list.';

NOTIFY pgrst, 'reload schema';

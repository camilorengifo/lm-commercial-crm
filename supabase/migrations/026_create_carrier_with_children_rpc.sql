-- Idempotent fix: ensure broker create RPC exists with the exact PostgREST signature.
-- Safe to rerun if 024 was applied before this function was added.

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

REVOKE ALL ON FUNCTION public.create_carrier_with_children(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_carrier_with_children(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_carrier_with_children(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_carrier_with_children(JSONB) IS
  'Creates a shared carrier with child rows and links it to the caller''s My Carriers list.';

NOTIFY pgrst, 'reload schema';

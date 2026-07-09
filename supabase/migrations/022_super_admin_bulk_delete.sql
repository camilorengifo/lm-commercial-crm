-- Super administrator role and cross-org bulk company soft delete

DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
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
      AND role = 'super_admin'
      AND is_active = true
  );
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
      AND role IN ('admin', 'super_admin')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.super_admin_bulk_delete_companies(
  p_company_ids UUID[],
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_owner_id UUID;
  v_deleted INTEGER := 0;
  v_failed JSONB := '[]'::JSONB;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super administrators can bulk delete companies';
  END IF;

  IF p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one company ID is required';
  END IF;

  FOREACH v_company_id IN ARRAY p_company_ids LOOP
    SELECT c.user_id
    INTO v_owner_id
    FROM public.companies c
    WHERE c.id = v_company_id
      AND c.deleted_at IS NULL;

    IF v_owner_id IS NULL THEN
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'companyId', v_company_id,
          'error', 'Company not found or already deleted'
        )
      );
      CONTINUE;
    END IF;

    UPDATE public.companies
    SET
      deleted_at = now(),
      deleted_by = v_user_id,
      delete_reason = v_reason
    WHERE id = v_company_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      v_failed := v_failed || jsonb_build_array(
        jsonb_build_object(
          'companyId', v_company_id,
          'error', 'Company not found or already deleted'
        )
      );
      CONTINUE;
    END IF;

    INSERT INTO public.company_delete_events (
      user_id,
      company_id,
      action,
      company_count,
      reason,
      blocked,
      metadata
    )
    VALUES (
      v_user_id,
      v_company_id,
      'company_bulk_delete',
      1,
      v_reason,
      false,
      jsonb_build_object(
        'previous_owner_user_id', v_owner_id,
        'performed_by_role', 'super_admin'
      )
    );

    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', jsonb_array_length(v_failed) = 0,
    'deleted', v_deleted,
    'failed', v_failed,
    'requested', array_length(p_company_ids, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_bulk_delete_companies(UUID[], TEXT) TO authenticated;

COMMENT ON FUNCTION public.super_admin_bulk_delete_companies(UUID[], TEXT) IS
  'Super-admin only: soft-delete companies across all owners with audit events.';

UPDATE public.profiles
SET role = 'super_admin'
WHERE lower(email) = lower('camilo@armstrongtransport.com');

-- Harden primary super admin (camilo@armstrongtransport.com) role management.
-- Only Camilo can grant/revoke super_admin. Camilo's account cannot be
-- demoted, deactivated, blocked, or deleted.

CREATE OR REPLACE FUNCTION public.is_primary_super_admin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_email, ''))) = lower('camilo@armstrongtransport.com');
$$;

CREATE OR REPLACE FUNCTION public.acting_profile_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.protect_primary_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acting_uid UUID := auth.uid();
  v_acting_email TEXT;
  v_acting_is_primary BOOLEAN := false;
BEGIN
  -- Session-backed requests: resolve acting user from auth.uid().
  -- Service-role updates (auth.uid() IS NULL) still hard-protect Camilo;
  -- grant/revoke checks for those paths are enforced in the Next.js API layer.
  IF v_acting_uid IS NOT NULL THEN
    v_acting_email := public.acting_profile_email();
    v_acting_is_primary := public.is_primary_super_admin_email(v_acting_email);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF public.is_primary_super_admin_email(OLD.email) THEN
      RAISE EXCEPTION
        'The primary super admin account cannot be deleted.';
    END IF;

    IF
      v_acting_uid IS NOT NULL
      AND OLD.role = 'super_admin'
      AND NOT v_acting_is_primary
    THEN
      RAISE EXCEPTION
        'Only the primary super admin can remove a super_admin user.';
    END IF;

    RETURN OLD;
  END IF;

  -- UPDATE path: Camilo is always protected, including service-role updates.
  IF public.is_primary_super_admin_email(OLD.email) THEN
    IF NEW.role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION
        'The primary super admin role cannot be changed.';
    END IF;

    IF COALESCE(NEW.is_active, true) = false THEN
      RAISE EXCEPTION
        'The primary super admin account cannot be deactivated.';
    END IF;

    IF COALESCE(NEW.is_blocked, false) = true THEN
      RAISE EXCEPTION
        'The primary super admin account cannot be blocked.';
    END IF;

    -- Keep primary email identity stable for protection matching.
    IF lower(trim(COALESCE(NEW.email, ''))) IS DISTINCT FROM
       lower('camilo@armstrongtransport.com') THEN
      RAISE EXCEPTION
        'The primary super admin email cannot be changed.';
    END IF;
  END IF;

  IF v_acting_uid IS NOT NULL THEN
    IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin' THEN
      IF NOT v_acting_is_primary THEN
        RAISE EXCEPTION
          'Only the primary super admin can grant super_admin.';
      END IF;
    END IF;

    IF OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin' THEN
      IF NOT v_acting_is_primary THEN
        RAISE EXCEPTION
          'Only the primary super admin can revoke super_admin.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_primary_super_admin ON public.profiles;

CREATE TRIGGER profiles_protect_primary_super_admin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_primary_super_admin();

-- Ensure Camilo remains super_admin after this migration.
UPDATE public.profiles
SET
  role = 'super_admin',
  is_active = true,
  is_blocked = false,
  blocked_at = NULL,
  blocked_reason = NULL
WHERE lower(email) = lower('camilo@armstrongtransport.com');

COMMENT ON FUNCTION public.protect_primary_super_admin() IS
  'Blocks demotion/deactivation/deletion of camilo@armstrongtransport.com and restricts super_admin grant/revoke to that account.';

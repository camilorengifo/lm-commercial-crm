-- Move a departing user's current CRM ownership in one transaction.
-- Historical actor columns (disposition_by, created_by, lifted_by,
-- deleted_by, archived_by, company_delete_events.user_id) stay unchanged.
-- Child rows are matched by their own user_id, so another broker's records
-- on the same company are left alone.

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
      AND user_id = OLD.user_id
      AND user_id IS DISTINCT FROM NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign_user_crm_ownership(
  p_from_user_id UUID,
  p_to_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_active BOOLEAN;
  v_is_blocked BOOLEAN;
  v_lock_key INTEGER;
  v_companies INTEGER := 0;
  v_contacts INTEGER := 0;
  v_activities INTEGER := 0;
  v_follow_ups INTEGER := 0;
  v_opportunities INTEGER := 0;
  v_insights INTEGER := 0;
  v_suppressions INTEGER := 0;
  v_reminders INTEGER := 0;
  v_carrier_pins INTEGER := 0;
  v_assistant_runs INTEGER := 0;
BEGIN
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Both users are required.';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot reassign records to the same user.';
  END IF;

  IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only an administrator can reassign CRM ownership.';
  END IF;

  PERFORM set_config('lock_timeout', '4000', true);
  PERFORM set_config('statement_timeout', '45000', true);

  v_lock_key := hashtext(p_from_user_id::text) & 2147483647;

  BEGIN
    PERFORM pg_advisory_xact_lock(814201, v_lock_key);
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE EXCEPTION 'A reassignment for this user is already running.'
        USING ERRCODE = '55P03';
  END;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_from_user_id) THEN
    RAISE EXCEPTION 'Departing user was not found.';
  END IF;

  SELECT role::text, COALESCE(is_active, true), COALESCE(is_blocked, false)
  INTO v_role, v_is_active, v_is_blocked
  FROM public.profiles
  WHERE id = p_to_user_id;

  IF NOT FOUND
     OR NOT v_is_active
     OR v_is_blocked
     OR v_role NOT IN ('broker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Companies can only be reassigned to an active broker, admin, or super admin.';
  END IF;

  UPDATE public.contacts
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  UPDATE public.activities
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_activities = ROW_COUNT;

  UPDATE public.follow_ups
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_follow_ups = ROW_COUNT;

  UPDATE public.load_opportunities
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_opportunities = ROW_COUNT;

  UPDATE public.company_ai_insights
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_insights = ROW_COUNT;

  IF to_regclass('public.outreach_suppressions') IS NOT NULL THEN
    UPDATE public.outreach_suppressions
    SET user_id = p_to_user_id
    WHERE user_id = p_from_user_id;
    GET DIAGNOSTICS v_suppressions = ROW_COUNT;
  END IF;

  UPDATE public.companies
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_companies = ROW_COUNT;

  UPDATE public.broker_reminder_logs
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_reminders = ROW_COUNT;

  DELETE FROM public.user_carriers AS departing
  USING public.user_carriers AS destination
  WHERE departing.user_id = p_from_user_id
    AND destination.user_id = p_to_user_id
    AND destination.carrier_id = departing.carrier_id;

  UPDATE public.user_carriers
  SET user_id = p_to_user_id
  WHERE user_id = p_from_user_id;
  GET DIAGNOSTICS v_carrier_pins = ROW_COUNT;

  IF to_regclass('public.ai_broker_assistant_runs') IS NOT NULL THEN
    EXECUTE
      'UPDATE public.ai_broker_assistant_runs
       SET user_id = $1
       WHERE user_id = $2'
    USING p_to_user_id, p_from_user_id;
    GET DIAGNOSTICS v_assistant_runs = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'companies', v_companies,
    'contacts', v_contacts,
    'activities', v_activities,
    'followUps', v_follow_ups,
    'loadOpportunities', v_opportunities,
    'companyAiInsights', v_insights,
    'outreachSuppressions', v_suppressions,
    'brokerReminderLogs', v_reminders,
    'userCarriers', v_carrier_pins,
    'aiBrokerAssistantRuns', v_assistant_runs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inspect_user_crm_ownership(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key INTEGER;
  v_in_progress BOOLEAN;
  v_companies INTEGER;
  v_contacts INTEGER;
  v_activities INTEGER;
  v_follow_ups INTEGER;
  v_opportunities INTEGER;
  v_insights INTEGER;
  v_suppressions INTEGER := 0;
  v_reminders INTEGER;
  v_carrier_pins INTEGER;
  v_assistant_runs INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only an administrator can inspect CRM ownership.';
  END IF;

  v_lock_key := hashtext(p_user_id::text) & 2147483647;

  SELECT EXISTS (
    SELECT 1
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid = 814201
      AND objid = v_lock_key
      AND objsubid = 2
      AND granted
  )
  INTO v_in_progress;

  SELECT count(*) INTO v_companies
  FROM public.companies
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_contacts
  FROM public.contacts
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_activities
  FROM public.activities
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_follow_ups
  FROM public.follow_ups
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_opportunities
  FROM public.load_opportunities
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_insights
  FROM public.company_ai_insights
  WHERE user_id = p_user_id;

  IF to_regclass('public.outreach_suppressions') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) FROM public.outreach_suppressions WHERE user_id = $1'
    INTO v_suppressions
    USING p_user_id;
  END IF;

  SELECT count(*) INTO v_reminders
  FROM public.broker_reminder_logs
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_carrier_pins
  FROM public.user_carriers
  WHERE user_id = p_user_id;

  IF to_regclass('public.ai_broker_assistant_runs') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) FROM public.ai_broker_assistant_runs WHERE user_id = $1'
    INTO v_assistant_runs
    USING p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'inProgress', v_in_progress,
    'companies', v_companies,
    'contacts', v_contacts,
    'activities', v_activities,
    'followUps', v_follow_ups,
    'loadOpportunities', v_opportunities,
    'companyAiInsights', v_insights,
    'outreachSuppressions', v_suppressions,
    'brokerReminderLogs', v_reminders,
    'userCarriers', v_carrier_pins,
    'aiBrokerAssistantRuns', v_assistant_runs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_user_crm_ownership(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_user_crm_ownership(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reassign_user_crm_ownership(UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.inspect_user_crm_ownership(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inspect_user_crm_ownership(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.inspect_user_crm_ownership(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_user_crm_ownership(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspect_user_crm_ownership(UUID) TO service_role;

-- Keep delete audits when an account is removed. The actor id is historical.
ALTER TABLE public.company_delete_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.company_delete_events
  DROP CONSTRAINT IF EXISTS company_delete_events_user_id_fkey;

ALTER TABLE public.company_delete_events
  ADD CONSTRAINT company_delete_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON FUNCTION public.reassign_user_crm_ownership(UUID, UUID) IS
  'Atomically move current CRM ownership from one user to an active broker, admin, or super admin.';

NOTIFY pgrst, 'reload schema';

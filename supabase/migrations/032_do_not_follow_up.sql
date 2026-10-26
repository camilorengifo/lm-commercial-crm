-- Do Not Follow Up disposition and outreach suppression.
-- follow_ups remains the only follow-up record. Closed rows are kept.
-- A new enum value cannot be referenced later in this same migration.

ALTER TYPE public.follow_up_status ADD VALUE IF NOT EXISTS 'do_not_follow_up';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'do_not_follow_up';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'outreach_suppression';

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition_reason TEXT,
  ADD COLUMN IF NOT EXISTS disposition_notes TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_disposition_reason_chk;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_disposition_reason_chk
  CHECK (
    disposition_reason IS NULL
    OR disposition_reason IN (
      'customer_requested_no_contact',
      'no_response_after_multiple_attempts',
      'not_interested',
      'not_a_good_fit',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS follow_ups_contact_id_idx
  ON public.follow_ups (contact_id);

CREATE INDEX IF NOT EXISTS follow_ups_status_idx
  ON public.follow_ups (status);

-- Persistent contact- or company-level suppression. Rows are updated when
-- lifted so created_by / lifted_by remain an audit trail. Nothing here
-- archives or deletes the company.
CREATE TABLE IF NOT EXISTS public.outreach_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts (id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT NOT NULL,
  notes TEXT,
  source_follow_up_id UUID REFERENCES public.follow_ups (id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ,
  lift_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outreach_suppressions_scope_chk
    CHECK (scope IN ('contact', 'company')),
  CONSTRAINT outreach_suppressions_scope_target_chk
    CHECK (
      (scope = 'company' AND contact_id IS NULL)
      OR (scope = 'contact' AND contact_id IS NOT NULL)
    ),
  CONSTRAINT outreach_suppressions_reason_chk
    CHECK (
      reason IN (
        'customer_requested_no_contact',
        'no_response_after_multiple_attempts',
        'not_interested',
        'not_a_good_fit',
        'other'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_suppressions_active_company_idx
  ON public.outreach_suppressions (company_id)
  WHERE active = true AND scope = 'company';

CREATE UNIQUE INDEX IF NOT EXISTS outreach_suppressions_active_contact_idx
  ON public.outreach_suppressions (contact_id)
  WHERE active = true AND scope = 'contact';

CREATE INDEX IF NOT EXISTS outreach_suppressions_company_id_idx
  ON public.outreach_suppressions (company_id);

CREATE INDEX IF NOT EXISTS outreach_suppressions_user_id_idx
  ON public.outreach_suppressions (user_id);

DROP TRIGGER IF EXISTS outreach_suppressions_set_updated_at
  ON public.outreach_suppressions;

CREATE TRIGGER outreach_suppressions_set_updated_at
BEFORE UPDATE ON public.outreach_suppressions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Block new pending follow-ups and reopening a closed follow-up into pending.
-- Editing the due date of a follow-up that is already pending stays allowed.
CREATE OR REPLACE FUNCTION public.follow_ups_reject_suppressed_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending'::public.follow_up_status THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'pending'::public.follow_up_status THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.outreach_suppressions AS suppression
    WHERE suppression.company_id = NEW.company_id
      AND suppression.scope = 'company'
      AND suppression.active = true
  ) THEN
    RAISE EXCEPTION 'Follow-ups are suppressed for this company because further contact was declined.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.contact_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.outreach_suppressions AS suppression
    WHERE suppression.contact_id = NEW.contact_id
      AND suppression.scope = 'contact'
      AND suppression.active = true
  ) THEN
    RAISE EXCEPTION 'Follow-ups are suppressed for this contact because further contact was declined. Other people at this company are not affected.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_ups_reject_suppressed_pending ON public.follow_ups;

CREATE TRIGGER follow_ups_reject_suppressed_pending
BEFORE INSERT OR UPDATE ON public.follow_ups
FOR EACH ROW
EXECUTE FUNCTION public.follow_ups_reject_suppressed_pending();

ALTER TABLE public.outreach_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_suppressions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_suppressions_select_own" ON public.outreach_suppressions;
DROP POLICY IF EXISTS "outreach_suppressions_insert_own" ON public.outreach_suppressions;
DROP POLICY IF EXISTS "outreach_suppressions_update_admin" ON public.outreach_suppressions;

CREATE POLICY "outreach_suppressions_select_own"
ON public.outreach_suppressions
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "outreach_suppressions_insert_own"
ON public.outreach_suppressions
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_admin()
    OR (
      user_id = auth.uid()
      AND public.user_owns_active_company(company_id)
    )
  )
);

-- Lifting or changing suppression is limited to administrators.
-- Brokers can read the warning and can create a suppression from Do Not Follow Up.
CREATE POLICY "outreach_suppressions_update_admin"
ON public.outreach_suppressions
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';

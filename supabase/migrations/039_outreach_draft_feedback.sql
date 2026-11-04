-- Broker ratings of AI commercial drafts.
-- Ratings are included in the next draft for the same company.
-- They do not retrain the model and they do not send any customer communication.

CREATE TABLE IF NOT EXISTS public.outreach_draft_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id),
  company_id UUID NOT NULL REFERENCES public.companies (id),
  outreach_type TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (
    rating IN ('useful', 'not_relevant', 'too_generic', 'incorrect')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_draft_feedback_company_created_idx
  ON public.outreach_draft_feedback (company_id, created_at DESC);

ALTER TABLE public.outreach_draft_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_draft_feedback FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_draft_feedback_select" ON public.outreach_draft_feedback;
DROP POLICY IF EXISTS "outreach_draft_feedback_insert" ON public.outreach_draft_feedback;

CREATE POLICY "outreach_draft_feedback_select"
ON public.outreach_draft_feedback
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "outreach_draft_feedback_insert"
ON public.outreach_draft_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_admin()
    OR public.user_owns_active_company(company_id)
  )
);

-- Load opportunities per company

CREATE TABLE public.load_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts (id) ON DELETE SET NULL,
  lane_origin TEXT,
  lane_destination TEXT,
  equipment_type TEXT,
  commodity TEXT,
  frequency TEXT,
  estimated_loads_per_week INTEGER,
  target_rate NUMERIC,
  quoted_rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'New',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX load_opportunities_user_id_idx ON public.load_opportunities (user_id);
CREATE INDEX load_opportunities_company_id_idx ON public.load_opportunities (company_id);
CREATE INDEX load_opportunities_contact_id_idx ON public.load_opportunities (contact_id);
CREATE INDEX load_opportunities_status_idx ON public.load_opportunities (status);

CREATE TRIGGER load_opportunities_set_updated_at
BEFORE UPDATE ON public.load_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.load_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "load_opportunities_select_own"
ON public.load_opportunities
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "load_opportunities_insert_own"
ON public.load_opportunities
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = load_opportunities.company_id
      AND companies.user_id = auth.uid()
  )
  AND (
    contact_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.contacts
      WHERE contacts.id = load_opportunities.contact_id
        AND contacts.company_id = load_opportunities.company_id
        AND contacts.user_id = auth.uid()
    )
  )
);

CREATE POLICY "load_opportunities_update_own"
ON public.load_opportunities
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = load_opportunities.company_id
      AND companies.user_id = auth.uid()
  )
  AND (
    contact_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.contacts
      WHERE contacts.id = load_opportunities.contact_id
        AND contacts.company_id = load_opportunities.company_id
        AND contacts.user_id = auth.uid()
    )
  )
);

CREATE POLICY "load_opportunities_delete_own"
ON public.load_opportunities
FOR DELETE
USING (user_id = auth.uid());

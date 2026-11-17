-- Internal freight-market research history.
-- These rows are not customer communications and are not shown in the assistant.
-- created_by is nullable so deleting a user does not delete the research history.

CREATE TABLE IF NOT EXISTS public.market_research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  origin TEXT,
  destination TEXT,
  equipment TEXT,
  commodity TEXT,
  research_period_start DATE,
  research_period_end DATE,
  market_direction TEXT NOT NULL CHECK (
    market_direction IN ('firming', 'softening', 'mixed', 'insufficient_data')
  ),
  report_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE TABLE IF NOT EXISTS public.market_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.market_research_reports (id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  publication_date DATE,
  retrieved_at TIMESTAMPTZ NOT NULL,
  supporting_finding TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS market_research_reports_company_created_idx
  ON public.market_research_reports (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS market_research_sources_report_idx
  ON public.market_research_sources (report_id);

ALTER TABLE public.market_research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_research_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.market_research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_research_sources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_research_reports_select" ON public.market_research_reports;
DROP POLICY IF EXISTS "market_research_reports_insert" ON public.market_research_reports;
DROP POLICY IF EXISTS "market_research_sources_select" ON public.market_research_sources;
DROP POLICY IF EXISTS "market_research_sources_insert" ON public.market_research_sources;

CREATE POLICY "market_research_reports_select"
ON public.market_research_reports
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "market_research_reports_insert"
ON public.market_research_reports
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_admin()
    OR public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "market_research_sources_select"
ON public.market_research_sources
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.market_research_reports AS report
    WHERE report.id = report_id
      AND (
        public.is_admin()
        OR public.user_owns_active_company(report.company_id)
      )
  )
);

CREATE POLICY "market_research_sources_insert"
ON public.market_research_sources
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.market_research_reports AS report
    WHERE report.id = report_id
      AND report.created_by = auth.uid()
      AND (
        public.is_admin()
        OR public.user_owns_active_company(report.company_id)
      )
  )
);

GRANT SELECT, INSERT ON TABLE public.market_research_reports TO authenticated;
GRANT SELECT, INSERT ON TABLE public.market_research_sources TO authenticated;

-- Harden broker data isolation: enforce ownership at the database layer.

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
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_active_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  );
$$;

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
USING (id = auth.uid());

CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_delete_own"
ON public.profiles
FOR DELETE
USING (id = auth.uid());

CREATE POLICY "profiles_select_admin"
ON public.profiles
FOR SELECT
USING (public.is_admin());

CREATE POLICY "profiles_update_admin"
ON public.profiles
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_own" ON public.companies;
DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
DROP POLICY IF EXISTS "companies_delete_own" ON public.companies;
DROP POLICY IF EXISTS "companies_select_admin" ON public.companies;
DROP POLICY IF EXISTS "companies_update_admin" ON public.companies;

CREATE POLICY "companies_select_own"
ON public.companies
FOR SELECT
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
);

CREATE POLICY "companies_insert_own"
ON public.companies
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_update_own"
ON public.companies
FOR UPDATE
USING (user_id = auth.uid() AND deleted_at IS NULL)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_delete_own"
ON public.companies
FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "companies_select_admin"
ON public.companies
FOR SELECT
USING (public.is_admin());

CREATE POLICY "companies_update_admin"
ON public.companies
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_select_admin" ON public.contacts;

CREATE POLICY "contacts_select_own"
ON public.contacts
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "contacts_insert_own"
ON public.contacts
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.user_owns_active_company(company_id)
);

CREATE POLICY "contacts_update_own"
ON public.contacts
FOR UPDATE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "contacts_delete_own"
ON public.contacts
FOR DELETE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "contacts_select_admin"
ON public.contacts
FOR SELECT
USING (public.is_admin());

-- activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_select_own" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_own" ON public.activities;
DROP POLICY IF EXISTS "activities_update_own" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_own" ON public.activities;
DROP POLICY IF EXISTS "activities_select_admin" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_admin" ON public.activities;

CREATE POLICY "activities_select_own"
ON public.activities
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "activities_insert_own"
ON public.activities
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.user_owns_active_company(company_id)
);

CREATE POLICY "activities_update_own"
ON public.activities
FOR UPDATE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "activities_delete_own"
ON public.activities
FOR DELETE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "activities_select_admin"
ON public.activities
FOR SELECT
USING (public.is_admin());

CREATE POLICY "activities_insert_admin"
ON public.activities
FOR INSERT
WITH CHECK (public.is_admin());

-- follow_ups
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_ups_select_own" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_own" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_update_own" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_delete_own" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_select_admin" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_admin" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_update_admin" ON public.follow_ups;
DROP POLICY IF EXISTS "follow_ups_delete_admin" ON public.follow_ups;

CREATE POLICY "follow_ups_select_own"
ON public.follow_ups
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "follow_ups_insert_own"
ON public.follow_ups
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.user_owns_active_company(company_id)
);

CREATE POLICY "follow_ups_update_own"
ON public.follow_ups
FOR UPDATE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "follow_ups_delete_own"
ON public.follow_ups
FOR DELETE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "follow_ups_select_admin"
ON public.follow_ups
FOR SELECT
USING (public.is_admin());

CREATE POLICY "follow_ups_insert_admin"
ON public.follow_ups
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_update_admin"
ON public.follow_ups
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_delete_admin"
ON public.follow_ups
FOR DELETE
USING (public.is_admin());

-- load_opportunities
ALTER TABLE public.load_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_opportunities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "load_opportunities_select_own" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_insert_own" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_update_own" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_delete_own" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_select_admin" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_insert_admin" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_update_admin" ON public.load_opportunities;
DROP POLICY IF EXISTS "load_opportunities_delete_admin" ON public.load_opportunities;

CREATE POLICY "load_opportunities_select_own"
ON public.load_opportunities
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "load_opportunities_insert_own"
ON public.load_opportunities
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.user_owns_active_company(company_id)
);

CREATE POLICY "load_opportunities_update_own"
ON public.load_opportunities
FOR UPDATE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "load_opportunities_delete_own"
ON public.load_opportunities
FOR DELETE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "load_opportunities_select_admin"
ON public.load_opportunities
FOR SELECT
USING (public.is_admin());

CREATE POLICY "load_opportunities_insert_admin"
ON public.load_opportunities
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_update_admin"
ON public.load_opportunities
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_delete_admin"
ON public.load_opportunities
FOR DELETE
USING (public.is_admin());

-- company_ai_insights
ALTER TABLE public.company_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_ai_insights FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_ai_insights_select_own" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_insert_own" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_update_own" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_delete_own" ON public.company_ai_insights;
DROP POLICY IF EXISTS "company_ai_insights_select_admin" ON public.company_ai_insights;

CREATE POLICY "company_ai_insights_select_own"
ON public.company_ai_insights
FOR SELECT
USING (
  public.is_admin()
  OR public.user_owns_active_company(company_id)
);

CREATE POLICY "company_ai_insights_insert_own"
ON public.company_ai_insights
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.user_owns_active_company(company_id)
);

CREATE POLICY "company_ai_insights_update_own"
ON public.company_ai_insights
FOR UPDATE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "company_ai_insights_delete_own"
ON public.company_ai_insights
FOR DELETE
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND public.user_owns_active_company(company_id)
  )
);

CREATE POLICY "company_ai_insights_select_admin"
ON public.company_ai_insights
FOR SELECT
USING (public.is_admin());

-- broker_reminder_logs
ALTER TABLE public.broker_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_reminder_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broker_reminder_logs_select_own" ON public.broker_reminder_logs;
DROP POLICY IF EXISTS "broker_reminder_logs_select_admin" ON public.broker_reminder_logs;

CREATE POLICY "broker_reminder_logs_select_own"
ON public.broker_reminder_logs
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "broker_reminder_logs_select_admin"
ON public.broker_reminder_logs
FOR SELECT
USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

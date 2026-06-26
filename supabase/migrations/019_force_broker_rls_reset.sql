-- Force broker data isolation by removing ALL existing RLS policies on CRM tables
-- and recreating only strict broker + admin policies.
--
-- RLS is PERMISSIVE by default: any old broad policy (e.g. USING (true)) will
-- override intent if left in place. This migration drops every policy on the
-- affected tables before creating the strict set.

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

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles',
        'companies',
        'contacts',
        'activities',
        'follow_ups',
        'load_opportunities',
        'company_ai_insights',
        'broker_reminder_logs'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

-- Drop policies on legacy opportunities table if it exists.
DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.opportunities') IS NOT NULL THEN
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'opportunities'
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.opportunities',
        pol.policyname
      );
    END LOOP;

    ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.opportunities FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "profiles_broker_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "profiles_broker_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_broker_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_broker_delete"
ON public.profiles
FOR DELETE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "profiles_admin_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "profiles_admin_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- companies (owner column: user_id)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

CREATE POLICY "companies_broker_select"
ON public.companies
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
);

CREATE POLICY "companies_broker_insert"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_broker_update"
ON public.companies
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND deleted_at IS NULL)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_broker_delete"
ON public.companies
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "companies_admin_select"
ON public.companies
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "companies_admin_insert"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "companies_admin_update"
ON public.companies
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "companies_admin_delete"
ON public.companies
FOR DELETE
TO authenticated
USING (public.is_admin());

-- contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY "contacts_broker_select"
ON public.contacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = contacts.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "contacts_broker_insert"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = contacts.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "contacts_broker_update"
ON public.contacts
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = contacts.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = contacts.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "contacts_broker_delete"
ON public.contacts
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = contacts.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "contacts_admin_select"
ON public.contacts
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "contacts_admin_insert"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "contacts_admin_update"
ON public.contacts
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "contacts_admin_delete"
ON public.contacts
FOR DELETE
TO authenticated
USING (public.is_admin());

-- activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities FORCE ROW LEVEL SECURITY;

CREATE POLICY "activities_broker_select"
ON public.activities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = activities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "activities_broker_insert"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = activities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "activities_broker_update"
ON public.activities
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = activities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = activities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "activities_broker_delete"
ON public.activities
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = activities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "activities_admin_select"
ON public.activities
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "activities_admin_insert"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "activities_admin_update"
ON public.activities
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "activities_admin_delete"
ON public.activities
FOR DELETE
TO authenticated
USING (public.is_admin());

-- follow_ups
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups FORCE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups_broker_select"
ON public.follow_ups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = follow_ups.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "follow_ups_broker_insert"
ON public.follow_ups
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = follow_ups.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "follow_ups_broker_update"
ON public.follow_ups
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = follow_ups.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = follow_ups.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "follow_ups_broker_delete"
ON public.follow_ups
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = follow_ups.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "follow_ups_admin_select"
ON public.follow_ups
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "follow_ups_admin_insert"
ON public.follow_ups
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_admin_update"
ON public.follow_ups
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_admin_delete"
ON public.follow_ups
FOR DELETE
TO authenticated
USING (public.is_admin());

-- load_opportunities
ALTER TABLE public.load_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_opportunities FORCE ROW LEVEL SECURITY;

CREATE POLICY "load_opportunities_broker_select"
ON public.load_opportunities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = load_opportunities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "load_opportunities_broker_insert"
ON public.load_opportunities
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = load_opportunities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "load_opportunities_broker_update"
ON public.load_opportunities
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = load_opportunities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = load_opportunities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "load_opportunities_broker_delete"
ON public.load_opportunities
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = load_opportunities.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "load_opportunities_admin_select"
ON public.load_opportunities
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "load_opportunities_admin_insert"
ON public.load_opportunities
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_admin_update"
ON public.load_opportunities
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_admin_delete"
ON public.load_opportunities
FOR DELETE
TO authenticated
USING (public.is_admin());

-- company_ai_insights
ALTER TABLE public.company_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_ai_insights FORCE ROW LEVEL SECURITY;

CREATE POLICY "company_ai_insights_broker_select"
ON public.company_ai_insights
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_ai_insights.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "company_ai_insights_broker_insert"
ON public.company_ai_insights
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_ai_insights.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "company_ai_insights_broker_update"
ON public.company_ai_insights
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_ai_insights.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_ai_insights.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "company_ai_insights_broker_delete"
ON public.company_ai_insights
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_ai_insights.company_id
      AND c.user_id = auth.uid()
      AND c.deleted_at IS NULL
  )
);

CREATE POLICY "company_ai_insights_admin_select"
ON public.company_ai_insights
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "company_ai_insights_admin_insert"
ON public.company_ai_insights
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "company_ai_insights_admin_update"
ON public.company_ai_insights
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "company_ai_insights_admin_delete"
ON public.company_ai_insights
FOR DELETE
TO authenticated
USING (public.is_admin());

-- broker_reminder_logs
ALTER TABLE public.broker_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_reminder_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "broker_reminder_logs_broker_select"
ON public.broker_reminder_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "broker_reminder_logs_admin_select"
ON public.broker_reminder_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

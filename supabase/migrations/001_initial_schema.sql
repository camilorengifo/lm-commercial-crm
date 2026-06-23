-- AI Commercial Assistant — initial schema
-- Each broker owns their rows via user_id = auth.uid()

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Custom types
-- ---------------------------------------------------------------------------

CREATE TYPE company_priority AS ENUM (
  'Low',
  'Medium',
  'High',
  'Hot Lead'
);

CREATE TYPE activity_type AS ENUM (
  'call',
  'email',
  'meeting',
  'visit',
  'note',
  'other'
);

CREATE TYPE follow_up_status AS ENUM (
  'pending',
  'completed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT,
  priority company_priority NOT NULL DEFAULT 'Medium',
  general_notes TEXT,
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX companies_user_id_idx ON public.companies (user_id);
CREATE INDEX companies_name_idx ON public.companies (name);
CREATE INDEX companies_priority_idx ON public.companies (priority);
CREATE INDEX companies_next_follow_up_at_idx ON public.companies (next_follow_up_at);

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  notes TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contacts_user_id_idx ON public.contacts (user_id);
CREATE INDEX contacts_company_id_idx ON public.contacts (company_id);

CREATE TRIGGER contacts_set_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL DEFAULT 'note',
  subject TEXT,
  notes TEXT,
  activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activities_user_id_idx ON public.activities (user_id);
CREATE INDEX activities_company_id_idx ON public.activities (company_id);

CREATE TRIGGER activities_set_updated_at
BEFORE UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------------

CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  status follow_up_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX follow_ups_user_id_idx ON public.follow_ups (user_id);
CREATE INDEX follow_ups_company_id_idx ON public.follow_ups (company_id);
CREATE INDEX follow_ups_due_at_idx ON public.follow_ups (due_at);

CREATE TRIGGER follow_ups_set_updated_at
BEFORE UPDATE ON public.follow_ups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_ai_insights
-- ---------------------------------------------------------------------------

CREATE TABLE public.company_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX company_ai_insights_user_id_idx ON public.company_ai_insights (user_id);
CREATE INDEX company_ai_insights_company_id_idx ON public.company_ai_insights (company_id);

CREATE TRIGGER company_ai_insights_set_updated_at
BEFORE UPDATE ON public.company_ai_insights
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile when a broker signs up
-- ---------------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_ai_insights ENABLE ROW LEVEL SECURITY;

-- profiles

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

-- companies

CREATE POLICY "companies_select_own"
ON public.companies
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "companies_insert_own"
ON public.companies
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_update_own"
ON public.companies
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "companies_delete_own"
ON public.companies
FOR DELETE
USING (user_id = auth.uid());

-- contacts

CREATE POLICY "contacts_select_own"
ON public.contacts
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "contacts_insert_own"
ON public.contacts
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = contacts.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "contacts_update_own"
ON public.contacts
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = contacts.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "contacts_delete_own"
ON public.contacts
FOR DELETE
USING (user_id = auth.uid());

-- activities

CREATE POLICY "activities_select_own"
ON public.activities
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "activities_insert_own"
ON public.activities
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = activities.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "activities_update_own"
ON public.activities
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = activities.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "activities_delete_own"
ON public.activities
FOR DELETE
USING (user_id = auth.uid());

-- follow_ups

CREATE POLICY "follow_ups_select_own"
ON public.follow_ups
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "follow_ups_insert_own"
ON public.follow_ups
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = follow_ups.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "follow_ups_update_own"
ON public.follow_ups
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = follow_ups.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "follow_ups_delete_own"
ON public.follow_ups
FOR DELETE
USING (user_id = auth.uid());

-- company_ai_insights

CREATE POLICY "company_ai_insights_select_own"
ON public.company_ai_insights
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "company_ai_insights_insert_own"
ON public.company_ai_insights
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = company_ai_insights.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "company_ai_insights_update_own"
ON public.company_ai_insights
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.companies
    WHERE companies.id = company_ai_insights.company_id
      AND companies.user_id = auth.uid()
  )
);

CREATE POLICY "company_ai_insights_delete_own"
ON public.company_ai_insights
FOR DELETE
USING (user_id = auth.uid());

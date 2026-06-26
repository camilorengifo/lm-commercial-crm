-- Link activities to contacts and store scheduled follow-up reference on timeline entries.
-- Uses explicit FK constraint name so PostgREST can embed contacts after schema reload.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE public.activities
    ADD COLUMN contact_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'scheduled_follow_up_at'
  ) THEN
    ALTER TABLE public.activities
    ADD COLUMN scheduled_follow_up_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND constraint_name = 'activities_contact_id_fkey'
  ) THEN
    ALTER TABLE public.activities
    ADD CONSTRAINT activities_contact_id_fkey
    FOREIGN KEY (contact_id)
    REFERENCES public.contacts (id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activities_contact_id_idx
  ON public.activities (contact_id);

NOTIFY pgrst, 'reload schema';

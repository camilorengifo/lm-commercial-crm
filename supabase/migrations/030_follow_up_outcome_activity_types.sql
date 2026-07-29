-- Follow-up outcome activity types + link activities to follow-ups.
-- Distinguishes no-response attempts from successful contact reschedules.

ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'follow_up_no_response';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'follow_up_rescheduled_contact';

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS follow_up_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_follow_up_id_fkey'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_follow_up_id_fkey
      FOREIGN KEY (follow_up_id)
      REFERENCES public.follow_ups (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activities_follow_up_id_idx
  ON public.activities (follow_up_id);

-- Prevent duplicate outcome logs for the same follow-up + outcome type + new due date.
CREATE UNIQUE INDEX IF NOT EXISTS activities_follow_up_outcome_dedupe_idx
  ON public.activities (follow_up_id, activity_type, scheduled_follow_up_at)
  WHERE follow_up_id IS NOT NULL
    AND scheduled_follow_up_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';

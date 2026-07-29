-- Link newly scheduled follow-ups to the completed source follow-up.

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS source_follow_up_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'follow_ups_source_follow_up_id_fkey'
  ) THEN
    ALTER TABLE public.follow_ups
      ADD CONSTRAINT follow_ups_source_follow_up_id_fkey
      FOREIGN KEY (source_follow_up_id)
      REFERENCES public.follow_ups (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS follow_ups_source_follow_up_id_idx
  ON public.follow_ups (source_follow_up_id);

-- One successor follow-up per completed source (prevents duplicate schedule retries).
CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_one_successor_per_source_idx
  ON public.follow_ups (source_follow_up_id)
  WHERE source_follow_up_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

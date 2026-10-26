-- The do_not_follow_up enum value is committed in the previous migration
-- and can be referenced here.

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_do_not_follow_up_disposition_chk;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_do_not_follow_up_disposition_chk
  CHECK (
    status <> 'do_not_follow_up'
    OR (
      disposition_reason IS NOT NULL
      AND disposition_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS follow_ups_do_not_follow_up_idx
  ON public.follow_ups (disposition_at DESC)
  WHERE status = 'do_not_follow_up';

NOTIFY pgrst, 'reload schema';

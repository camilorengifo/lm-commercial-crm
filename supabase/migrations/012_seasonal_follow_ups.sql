-- Seasonal / future opportunity follow-up fields

ALTER TABLE public.follow_ups
ADD COLUMN IF NOT EXISTS follow_up_type TEXT DEFAULT 'regular',
ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER,
ADD COLUMN IF NOT EXISTS reminder_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS seasonal_context TEXT;

CREATE INDEX IF NOT EXISTS follow_ups_follow_up_type_idx
  ON public.follow_ups (follow_up_type);

UPDATE public.follow_ups
SET follow_up_type = 'regular'
WHERE follow_up_type IS NULL OR trim(follow_up_type) = '';

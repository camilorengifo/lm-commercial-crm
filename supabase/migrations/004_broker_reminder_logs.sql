-- Internal broker daily reminder email logs (cron job only)

CREATE TABLE public.broker_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  error_message TEXT,
  counts JSONB
);

CREATE INDEX broker_reminder_logs_user_id_idx ON public.broker_reminder_logs (user_id);
CREATE INDEX broker_reminder_logs_sent_at_idx ON public.broker_reminder_logs (sent_at DESC);

ALTER TABLE public.broker_reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_reminder_logs_select_own"
ON public.broker_reminder_logs
FOR SELECT
USING (user_id = auth.uid());

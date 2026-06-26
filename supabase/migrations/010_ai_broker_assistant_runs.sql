-- AI Broker Assistant run history

CREATE TABLE IF NOT EXISTS public.ai_broker_assistant_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  input_summary TEXT,
  output_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_broker_assistant_runs_user_id_idx
  ON public.ai_broker_assistant_runs (user_id);

CREATE INDEX IF NOT EXISTS ai_broker_assistant_runs_generated_at_idx
  ON public.ai_broker_assistant_runs (generated_at DESC);

ALTER TABLE public.ai_broker_assistant_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_broker_assistant_runs_select_own"
ON public.ai_broker_assistant_runs
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "ai_broker_assistant_runs_insert_own"
ON public.ai_broker_assistant_runs
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_broker_assistant_runs_select_admin"
ON public.ai_broker_assistant_runs
FOR SELECT
USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

-- Token-based user invitations (admin → broker onboarding)

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'broker',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  existing_user BOOLEAN NOT NULL DEFAULT false,
  auth_user_id UUID
);

CREATE INDEX IF NOT EXISTS user_invitations_token_idx
  ON public.user_invitations (token);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON public.user_invitations (lower(email));

CREATE INDEX IF NOT EXISTS user_invitations_pending_email_idx
  ON public.user_invitations (lower(email))
  WHERE accepted_at IS NULL;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- No client policies: invitations are read/written via service role on the server only.

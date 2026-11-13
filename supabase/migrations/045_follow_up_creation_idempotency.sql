-- Idempotency keys for one follow-up save and one activity save.
--
-- This does not make (company, contact, due date) unique. Brokers can still
-- schedule multiple follow-ups for the same company. Each intentional save
-- uses its own key. Historical rows stay NULL and are not updated or deleted.
--
-- Suspected accidental duplicates can be reviewed with this read-only query.
-- Do not delete from this migration.
--
-- SELECT company_id, contact_id, due_at, title, status,
--        count(*) AS copies,
--        min(created_at) AS first_created_at,
--        max(created_at) AS last_created_at,
--        array_agg(id ORDER BY created_at) AS ids
-- FROM public.follow_ups
-- GROUP BY company_id, contact_id, due_at, title, status
-- HAVING count(*) > 1
--    AND max(created_at) - min(created_at) < interval '2 minutes';

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS creation_key TEXT;

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_creation_key_len_chk;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_creation_key_len_chk
  CHECK (
    creation_key IS NULL
    OR char_length(creation_key) BETWEEN 8 AND 160
  );

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_creation_key_uidx
  ON public.follow_ups (creation_key)
  WHERE creation_key IS NOT NULL;

COMMENT ON COLUMN public.follow_ups.creation_key IS
  'Idempotency key for a single create. NULL on historical rows. Not unique per company.';

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS creation_key TEXT;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_creation_key_len_chk;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_creation_key_len_chk
  CHECK (
    creation_key IS NULL
    OR char_length(creation_key) BETWEEN 8 AND 160
  );

CREATE UNIQUE INDEX IF NOT EXISTS activities_creation_key_uidx
  ON public.activities (creation_key)
  WHERE creation_key IS NOT NULL;

COMMENT ON COLUMN public.activities.creation_key IS
  'Idempotency key for a single activity insert. NULL on historical rows.';

NOTIFY pgrst, 'reload schema';

-- One open follow-up per company.
-- Migration 045 kept multiple pending rows on purpose. Brokers now share one
-- sequence per company_id. The contact on an activity records who was managed.
--
-- Duplicate pending rows are cancelled. Their notes stay on the row, and no
-- activity is inserted, so the follow-up counter does not increase.
-- When the latest activity names a next date, the surviving row uses that date.
-- Later copies of the same completion outcome are removed so one management
-- stays on the timeline. The earliest outcome row is kept.

CREATE TEMP TABLE follow_up_explicit_next ON COMMIT DROP AS
SELECT DISTINCT ON (company_id)
  company_id,
  scheduled_follow_up_at
FROM public.activities
WHERE scheduled_follow_up_at IS NOT NULL
ORDER BY company_id, activity_at DESC, created_at DESC, id DESC;

CREATE TEMP TABLE follow_up_pending_ranked ON COMMIT DROP AS
SELECT
  follow_up.id,
  follow_up.company_id,
  follow_up.due_at,
  explicit.scheduled_follow_up_at,
  ROW_NUMBER() OVER (
    PARTITION BY follow_up.company_id
    ORDER BY
      CASE
        WHEN explicit.scheduled_follow_up_at IS NOT NULL
         AND follow_up.due_at = explicit.scheduled_follow_up_at THEN 0
        ELSE 1
      END,
      follow_up.created_at DESC,
      follow_up.id DESC
  ) AS rank
FROM public.follow_ups AS follow_up
LEFT JOIN follow_up_explicit_next AS explicit
  ON explicit.company_id = follow_up.company_id
WHERE follow_up.status = 'pending';

UPDATE public.follow_ups AS follow_up
SET due_at = ranked.scheduled_follow_up_at
FROM follow_up_pending_ranked AS ranked
WHERE follow_up.id = ranked.id
  AND ranked.rank = 1
  AND ranked.scheduled_follow_up_at IS NOT NULL
  AND follow_up.due_at IS DISTINCT FROM ranked.scheduled_follow_up_at;

UPDATE public.follow_ups AS follow_up
SET status = 'cancelled'
FROM follow_up_pending_ranked AS ranked
WHERE follow_up.id = ranked.id
  AND ranked.rank > 1
  AND follow_up.status = 'pending';

UPDATE public.companies AS company
SET next_follow_up_at = keeper.due_at
FROM (
  SELECT follow_up.company_id, follow_up.due_at
  FROM public.follow_ups AS follow_up
  JOIN follow_up_pending_ranked AS ranked
    ON ranked.id = follow_up.id
   AND ranked.rank = 1
  WHERE follow_up.status = 'pending'
) AS keeper
WHERE company.id = keeper.company_id
  AND company.next_follow_up_at IS DISTINCT FROM keeper.due_at;

DELETE FROM public.activities AS extra
USING public.activities AS kept
WHERE extra.follow_up_id IS NOT NULL
  AND extra.activity_type IN (
    'follow_up_no_response'::public.activity_type,
    'follow_up_rescheduled_contact'::public.activity_type
  )
  AND extra.follow_up_id = kept.follow_up_id
  AND extra.activity_type = kept.activity_type
  AND (extra.created_at, extra.id) > (kept.created_at, kept.id);

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_one_pending_per_company_idx
  ON public.follow_ups (company_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS activities_one_follow_up_outcome_idx
  ON public.activities (follow_up_id, activity_type)
  WHERE follow_up_id IS NOT NULL
    AND activity_type IN (
      'follow_up_no_response'::public.activity_type,
      'follow_up_rescheduled_contact'::public.activity_type
    );

COMMENT ON INDEX public.follow_ups_one_pending_per_company_idx IS
  'One open follow-up per company. Contacts share that sequence.';

NOTIFY pgrst, 'reload schema';

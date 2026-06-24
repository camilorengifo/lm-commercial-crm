-- Enhance load_opportunities for freight sales pipeline tracking

ALTER TABLE public.load_opportunities
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS probability INTEGER NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS expected_close_date DATE,
ADD COLUMN IF NOT EXISTS next_step TEXT,
ADD COLUMN IF NOT EXISTS estimated_loads TEXT,
ADD COLUMN IF NOT EXISTS estimated_revenue_usd NUMERIC,
ADD COLUMN IF NOT EXISTS estimated_margin_usd NUMERIC;

-- Migrate legacy status values to freight-sales stages
UPDATE public.load_opportunities SET status = 'prospecting' WHERE status = 'New';
UPDATE public.load_opportunities SET status = 'quoted' WHERE status = 'Quoted';
UPDATE public.load_opportunities SET status = 'negotiating' WHERE status = 'On Hold';
UPDATE public.load_opportunities SET status = 'won' WHERE status = 'Won';
UPDATE public.load_opportunities SET status = 'lost' WHERE status = 'Lost';

ALTER TABLE public.load_opportunities
ALTER COLUMN status SET DEFAULT 'prospecting';

-- Backfill opportunity names from existing lane/commodity data
UPDATE public.load_opportunities
SET name = COALESCE(
  NULLIF(TRIM(name), ''),
  NULLIF(TRIM(commodity), ''),
  NULLIF(
    TRIM(
      CONCAT(
        COALESCE(lane_origin, ''),
        CASE
          WHEN lane_origin IS NOT NULL AND lane_destination IS NOT NULL THEN ' → '
          ELSE ''
        END,
        COALESCE(lane_destination, '')
      )
    ),
    ''
  ),
  'Oportunidad de carga'
)
WHERE name IS NULL OR TRIM(name) = '';

ALTER TABLE public.load_opportunities
ALTER COLUMN name SET NOT NULL;

CREATE INDEX IF NOT EXISTS load_opportunities_expected_close_date_idx
ON public.load_opportunities (expected_close_date);

CREATE INDEX IF NOT EXISTS load_opportunities_status_idx_v2
ON public.load_opportunities (status);

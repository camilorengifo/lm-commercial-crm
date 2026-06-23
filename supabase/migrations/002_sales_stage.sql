-- Add sales_stage to companies for pipeline tracking

CREATE TYPE sales_stage AS ENUM (
  'New Lead',
  'Contacted',
  'In Follow-up',
  'Quoted',
  'Customer',
  'Not Interested',
  'Dormant'
);

ALTER TABLE public.companies
ADD COLUMN sales_stage sales_stage NOT NULL DEFAULT 'New Lead';

CREATE INDEX companies_sales_stage_idx ON public.companies (sales_stage);

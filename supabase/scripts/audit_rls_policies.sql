-- Audit RLS policies on CRM tables. Run in Supabase SQL editor.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'companies',
    'contacts',
    'activities',
    'follow_ups',
    'load_opportunities',
    'opportunities',
    'company_ai_insights',
    'profiles'
  )
order by tablename, policyname;

-- Dangerous patterns to look for manually:
-- qual or with_check containing: 'true', 'auth.role()', 'IS NOT NULL' without ownership/admin checks

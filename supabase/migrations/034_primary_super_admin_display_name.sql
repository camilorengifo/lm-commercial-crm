-- Keep the existing primary super admin profile addressable by name.
-- This updates the row already tied to camilo@armstrongtransport.com.
-- It does not insert an auth user or a second profile.

UPDATE public.profiles
SET full_name = 'Camilo Rengifo'
WHERE lower(email) = lower('camilo@armstrongtransport.com')
  AND btrim(COALESCE(full_name, '')) = '';

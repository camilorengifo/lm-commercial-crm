-- Allow admins to manage load opportunities (broker ownership preserved on rows)

CREATE POLICY "load_opportunities_insert_admin"
ON public.load_opportunities
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_update_admin"
ON public.load_opportunities
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "load_opportunities_delete_admin"
ON public.load_opportunities
FOR DELETE
USING (public.is_admin());

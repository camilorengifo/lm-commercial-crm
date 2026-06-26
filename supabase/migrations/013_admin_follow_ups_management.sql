-- Allow admins to manage follow-ups for any company (broker ownership preserved on rows)

CREATE POLICY "follow_ups_insert_admin"
ON public.follow_ups
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_update_admin"
ON public.follow_ups
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "follow_ups_delete_admin"
ON public.follow_ups
FOR DELETE
USING (public.is_admin());

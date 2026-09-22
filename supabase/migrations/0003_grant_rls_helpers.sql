-- The RLS policies call these SECURITY DEFINER helpers while evaluating authenticated reads.
-- Keep anonymous access revoked; authenticated users need EXECUTE for policy evaluation.
grant execute on function public.current_profile() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.require_authenticated() to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;

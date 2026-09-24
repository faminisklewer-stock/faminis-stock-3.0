create or replace function public.reset_location_stock(p_location_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();

  if actor not in ('MASTER', 'WAREHOUSE')
     or not public.can_access_location(p_location_id)
  then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.stocks(product_id, location_id, quantity, updated_at)
  select p.id, p_location_id, 0, now()
  from public.products p
  where p.active = true
  on conflict (product_id, location_id) do nothing;

  update public.stocks
  set quantity = 0,
      updated_at = now()
  where location_id = p_location_id
    and product_id in (select id from public.products where active = true);

  get diagnostics affected = row_count;

  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description)
  values (auth.uid(), actor, p_location_id, 'RESET_LOCATION_STOCK', 'LOCATION', p_location_id, 'Reset semua stok aktif ke 0');

  return affected;
end $$;

grant execute on function public.reset_location_stock(uuid) to authenticated;

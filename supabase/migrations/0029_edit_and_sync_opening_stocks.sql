create or replace function public.update_opening_stock(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.app_role;
  opening_stock_id uuid;
  opening_quantity integer;
  current_quantity integer;
  current_reserved integer;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();

  if actor <> 'MASTER' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select id, quantity
  into opening_stock_id, opening_quantity
  from public.opening_stocks
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if not found then
    raise exception 'OPENING_STOCK_NOT_FOUND';
  end if;

  select quantity, reserved_quantity
  into current_quantity, current_reserved
  from public.stocks
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if not found or current_quantity <> opening_quantity or current_reserved <> 0 then
    raise exception 'STOCK_ALREADY_USED';
  end if;

  update public.opening_stocks
  set quantity = p_quantity
  where id = opening_stock_id;

  update public.stocks
  set quantity = p_quantity,
      updated_at = now()
  where product_id = p_product_id and location_id = p_location_id;

  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description)
  values (auth.uid(), actor, p_location_id, 'OPENING_STOCK_UPDATED', 'OPENING_STOCK', opening_stock_id, 'Stok awal diubah.');

  return opening_stock_id;
end;
$$;

revoke all on function public.update_opening_stock(uuid, uuid, integer) from public, anon;
grant execute on function public.update_opening_stock(uuid, uuid, integer) to authenticated;

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

  update public.opening_stocks
  set quantity = 0
  where location_id = p_location_id;

  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description)
  values (auth.uid(), actor, p_location_id, 'RESET_LOCATION_STOCK', 'LOCATION', p_location_id, 'Reset semua stok dan stok awal aktif ke 0');

  return affected;
end;
$$;

grant execute on function public.reset_location_stock(uuid) to authenticated;
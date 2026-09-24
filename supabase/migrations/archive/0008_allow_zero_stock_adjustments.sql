create or replace function public.adjust_stock(p_product_id uuid, p_location_id uuid, p_physical_quantity integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity integer;
  adjustment_id uuid;
  delta integer;
  actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();

  if actor not in ('MASTER', 'WAREHOUSE')
     or not public.can_access_location(p_location_id)
     or p_physical_quantity < 0
     or coalesce(trim(p_reason), '') = ''
  then
    raise exception 'PERMISSION_DENIED';
  end if;

  select quantity into current_quantity
  from public.stocks
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if current_quantity is null then
    insert into public.stocks(product_id, location_id, quantity, updated_at)
    values (p_product_id, p_location_id, 0, now())
    on conflict (product_id, location_id) do nothing;
    current_quantity := 0;
  end if;

  delta := p_physical_quantity - current_quantity;

  insert into public.stock_adjustments(product_id, location_id, system_quantity, physical_quantity, reason, created_by)
  values (p_product_id, p_location_id, current_quantity, p_physical_quantity, p_reason, auth.uid())
  returning id into adjustment_id;

  insert into public.stocks(product_id, location_id, quantity, updated_at)
  values (p_product_id, p_location_id, p_physical_quantity, now())
  on conflict (product_id, location_id)
  do update set quantity = excluded.quantity, updated_at = now();

  if delta <> 0 then
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by)
    values (p_product_id, p_location_id, 'ADJUSTMENT', delta, 'STOCK_ADJUSTMENT', adjustment_id, auth.uid());
  end if;

  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description)
  values (auth.uid(), actor, p_location_id, 'STOCK_ADJUSTMENT', 'STOCK_ADJUSTMENT', adjustment_id, p_reason);

  return adjustment_id;
end $$;

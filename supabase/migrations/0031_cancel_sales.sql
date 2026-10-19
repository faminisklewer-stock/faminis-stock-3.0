alter table public.transactions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

create or replace function public.reject_cancelled_sale_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.cancelled_at is not null then
    raise exception 'TRANSACTION_CANCELLED';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_cancelled_sale_update on public.transactions;
create trigger prevent_cancelled_sale_update
before update on public.transactions
for each row execute function public.reject_cancelled_sale_update();

create or replace function public.cancel_sale(p_transaction_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  sale public.transactions;
  actor public.app_role;
  old_items jsonb;
  stock_row record;
  updated_quantity integer;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor is distinct from 'MASTER' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_transaction_id is null then
    raise exception 'INVALID_TRANSACTION';
  end if;

  select * into sale
  from public.transactions
  where id = p_transaction_id
  for update;
  if sale.id is null then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if not public.can_access_location(sale.location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if sale.cancelled_at is not null then
    raise exception 'SALE_ALREADY_CANCELLED';
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_id', item.product_id,
    'quantity', item.quantity,
    'unit_price', item.unit_price
  ) order by item.product_id)
  into old_items
  from public.transaction_items item
  where item.transaction_id = sale.id;
  if old_items is null then
    raise exception 'TRANSACTION_ITEMS_NOT_FOUND';
  end if;

  for stock_row in
    select item.product_id, sum(item.quantity)::bigint as quantity
    from public.transaction_items item
    where item.transaction_id = sale.id
    group by item.product_id
    order by item.product_id
  loop
    if stock_row.quantity > 2147483647 then
      raise exception 'STOCK_QUANTITY_OVERFLOW';
    end if;

    insert into public.stocks as stock(product_id, location_id, quantity)
    values (stock_row.product_id, sale.location_id, stock_row.quantity::integer)
    on conflict (product_id, location_id) do update
    set quantity = stock.quantity + excluded.quantity,
        updated_at = now()
    where stock.quantity::bigint + excluded.quantity <= 2147483647
    returning stock.quantity into updated_quantity;
    if not found then
      raise exception 'STOCK_QUANTITY_OVERFLOW';
    end if;

    insert into public.stock_movements(
      product_id, location_id, movement_type, quantity,
      reference_type, reference_id, created_by
    )
    values (
      stock_row.product_id,
      sale.location_id,
      'RETURN',
      stock_row.quantity::integer,
      'TRANSACTION_CANCEL',
      sale.id,
      auth.uid()
    );
  end loop;

  update public.transactions
  set cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = sale.id
  returning * into sale;

  insert into public.audit_logs(
    user_id, role, location_id, action, reference_type, reference_id, description, metadata
  )
  values (
    auth.uid(),
    actor,
    sale.location_id,
    'SALE_CANCEL',
    'TRANSACTION',
    sale.id,
    sale.invoice_no,
    jsonb_build_object(
      'items', old_items,
      'grand_total', sale.grand_total,
      'cancelled_at', sale.cancelled_at
    )
  );

  return sale;
end;
$$;

revoke all on function public.cancel_sale(uuid) from public, anon;
grant execute on function public.cancel_sale(uuid) to authenticated;

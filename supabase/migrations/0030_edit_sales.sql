alter table public.transactions
  add column if not exists edited_at timestamptz;

create or replace function public.edit_sale(
  p_transaction_id uuid,
  p_expected_edited_at timestamptz,
  p_items jsonb,
  p_method public.payment_method,
  p_paid_amount numeric
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  sale public.transactions;
  old_payment public.payments;
  actor public.app_role;
  item jsonb;
  product_id uuid;
  quantity_value numeric;
  price_value numeric;
  new_subtotal numeric := 0;
  new_total numeric := 0;
  normalized_paid_amount numeric;
  old_items jsonb;
  old_subtotal numeric;
  old_grand_total numeric;
  stock_row record;
  old_quantity integer;
  new_quantity integer;
  stock_quantity integer;
  reserved_quantity integer;
  delta integer;
  distinct_product_count integer;
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
  old_subtotal := sale.subtotal;
  old_grand_total := sale.grand_total;
  if not public.can_access_location(sale.location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if sale.edited_at is distinct from p_expected_edited_at then
    raise exception 'TRANSACTION_CHANGED';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_SALE_REQUEST';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_SALE_REQUEST';
  end if;
  if p_method is null or p_paid_amount is null or p_paid_amount < 0
    or p_paid_amount <> round(p_paid_amount, 2) then
    raise exception 'INVALID_PAYMENT';
  end if;
  normalized_paid_amount := round(p_paid_amount, 2);

  select * into old_payment
  from public.payments
  where transaction_id = sale.id
  for update;
  if old_payment.transaction_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  for item in select value from jsonb_array_elements(p_items) as entries(value) loop
    if jsonb_typeof(item->'product_id') is distinct from 'string'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or jsonb_typeof(item->'unit_price') is distinct from 'number' then
      raise exception 'INVALID_LINE_ITEM';
    end if;
    product_id := nullif(item->>'product_id', '')::uuid;
    quantity_value := (item->>'quantity')::numeric;
    price_value := (item->>'unit_price')::numeric;
    if product_id is null
      or quantity_value is null
      or quantity_value <= 0
      or quantity_value <> trunc(quantity_value)
      or quantity_value > 2147483647
      or price_value is null
      or price_value <= 0
      or price_value <> round(price_value, 2) then
      raise exception 'INVALID_LINE_ITEM';
    end if;
    if not exists (
      select 1
      from public.products p
      where p.id = product_id
        and (p.active or exists (
          select 1 from public.transaction_items old_item
          where old_item.transaction_id = sale.id
            and old_item.product_id = p.id
        ))
    ) then
      raise exception 'PRODUCT_NOT_ACTIVE';
    end if;
    new_subtotal := new_subtotal + quantity_value * price_value;
  end loop;

  select count(distinct (entry->>'product_id')::uuid)
  into distinct_product_count
  from jsonb_array_elements(p_items) as entries(entry);
  if distinct_product_count <> jsonb_array_length(p_items) then
    raise exception 'DUPLICATE_PRODUCT';
  end if;

  new_subtotal := round(new_subtotal, 2);
  new_total := round(greatest(0, new_subtotal - sale.discount), 2);
  if normalized_paid_amount < new_total then
    raise exception 'INSUFFICIENT_PAYMENT';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', old_item.product_id,
    'quantity', old_item.quantity,
    'unit_price', old_item.unit_price
  )), '[]'::jsonb)
  into old_items
  from public.transaction_items old_item
  where old_item.transaction_id = sale.id;

  for stock_row in
    select affected.product_id
    from (
      select old_item.product_id
      from public.transaction_items old_item
      where old_item.transaction_id = sale.id
      union
      select (entry->>'product_id')::uuid
      from jsonb_array_elements(p_items) as entries(entry)
    ) affected
    order by affected.product_id
  loop
    select coalesce(sum(old_item.quantity), 0)::integer
    into old_quantity
    from public.transaction_items old_item
    where old_item.transaction_id = sale.id
      and old_item.product_id = stock_row.product_id;

    select coalesce(sum((entry->>'quantity')::numeric), 0)::integer
    into new_quantity
    from jsonb_array_elements(p_items) as entries(entry)
    where (entry->>'product_id')::uuid = stock_row.product_id;

    delta := old_quantity - new_quantity;
    if delta = 0 then
      continue;
    end if;

    select s.quantity, s.reserved_quantity
    into stock_quantity, reserved_quantity
    from public.stocks s
    where s.product_id = stock_row.product_id
      and s.location_id = sale.location_id
    for update;

    if not found then
      if delta < 0 then
        raise exception 'INSUFFICIENT_STOCK';
      end if;
      insert into public.stocks(product_id, location_id, quantity)
      values (stock_row.product_id, sale.location_id, delta);
    else
      if stock_quantity + delta < reserved_quantity then
        raise exception 'INSUFFICIENT_STOCK';
      end if;
      update public.stocks
      set quantity = stock_quantity + delta,
          updated_at = now()
      where product_id = stock_row.product_id
        and location_id = sale.location_id;
    end if;

    insert into public.stock_movements(
      product_id, location_id, movement_type, quantity,
      reference_type, reference_id, created_by
    )
    values (
      stock_row.product_id,
      sale.location_id,
      case when delta > 0 then 'RETURN'::public.movement_type else 'SALE'::public.movement_type end,
      delta,
      'TRANSACTION_EDIT',
      sale.id,
      auth.uid()
    );
  end loop;

  delete from public.transaction_items where transaction_id = sale.id;
  for item in select value from jsonb_array_elements(p_items) as entries(value) loop
    insert into public.transaction_items(transaction_id, product_id, quantity, unit_price)
    values (
      sale.id,
      (item->>'product_id')::uuid,
      (item->>'quantity')::integer,
      (item->>'unit_price')::numeric
    );
  end loop;

  update public.transactions
  set subtotal = new_subtotal,
      grand_total = new_total,
      edited_at = now()
  where id = sale.id
  returning * into sale;

  update public.payments
  set method = p_method,
      paid_amount = normalized_paid_amount,
      change_amount = normalized_paid_amount - new_total
  where transaction_id = sale.id;

  insert into public.audit_logs(
    user_id, role, location_id, action, reference_type, reference_id, description, metadata
  )
  values (
    auth.uid(),
    actor,
    sale.location_id,
    'SALE_EDIT',
    'TRANSACTION',
    sale.id,
    sale.invoice_no,
    jsonb_build_object(
      'before', jsonb_build_object(
        'items', old_items,
        'subtotal', old_subtotal,
        'discount', sale.discount,
        'grand_total', old_grand_total,
        'method', old_payment.method,
        'paid_amount', old_payment.paid_amount,
        'change_amount', old_payment.change_amount
      ),
      'after', jsonb_build_object(
        'items', p_items,
        'subtotal', new_subtotal,
        'discount', sale.discount,
        'grand_total', new_total,
        'method', p_method,
        'paid_amount', normalized_paid_amount,
        'change_amount', normalized_paid_amount - new_total
      )
    )
  );

  return sale;
end;
$$;

revoke all on function public.edit_sale(uuid, timestamptz, jsonb, public.payment_method, numeric) from public, anon;
grant execute on function public.edit_sale(uuid, timestamptz, jsonb, public.payment_method, numeric) to authenticated;

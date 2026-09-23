-- Harden RPC input validation. Frontend validation is not a security boundary.

create or replace function public.record_sale(
  p_location_id uuid, p_items jsonb, p_discount numeric, p_method public.payment_method,
  p_paid_amount numeric, p_idempotency_key uuid
) returns public.transactions language plpgsql security definer set search_path = public
as $$
declare sale public.transactions; item jsonb; subtotal numeric := 0; total numeric := 0; existing public.transactions; actor public.app_role; product_active boolean;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor not in ('MASTER', 'LIVE', 'RUKO') or not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  if p_idempotency_key is null or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID_SALE_REQUEST'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_paid_amount, 0) < 0 then raise exception 'INVALID_PAYMENT'; end if;
  select * into existing from public.transactions where idempotency_key = p_idempotency_key;
  if existing.id is not null then return existing; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::integer, 0) <= 0 or coalesce((item->>'unit_price')::numeric, 0) <= 0 then raise exception 'INVALID_LINE_ITEM'; end if;
    select active into product_active from public.products where id = (item->>'product_id')::uuid;
    if product_active is distinct from true then raise exception 'PRODUCT_NOT_ACTIVE'; end if;
    subtotal := subtotal + ((item->>'quantity')::integer * (item->>'unit_price')::numeric);
  end loop;
  total := greatest(0, subtotal - p_discount);
  if p_paid_amount < total then raise exception 'INSUFFICIENT_PAYMENT'; end if;
  insert into public.transactions(invoice_no, location_id, created_by, subtotal, discount, grand_total, idempotency_key)
  values (public.next_invoice_number(), p_location_id, auth.uid(), subtotal, p_discount, total, p_idempotency_key) returning * into sale;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.transaction_items(transaction_id, product_id, quantity, unit_price) values (sale.id, (item->>'product_id')::uuid, (item->>'quantity')::integer, (item->>'unit_price')::numeric);
    update public.stocks set quantity = quantity - (item->>'quantity')::integer, updated_at = now() where product_id = (item->>'product_id')::uuid and location_id = p_location_id and quantity >= (item->>'quantity')::integer;
    if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, p_location_id, 'SALE', -((item->>'quantity')::integer), 'TRANSACTION', sale.id, auth.uid());
  end loop;
  insert into public.payments(transaction_id, method, paid_amount, change_amount) values (sale.id, p_method, p_paid_amount, p_paid_amount - total);
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_location_id, 'SALE', 'TRANSACTION', sale.id, sale.invoice_no);
  return sale;
end $$;

create or replace function public.create_transfer(p_source_location_id uuid, p_destination_location_id uuid, p_items jsonb, p_notes text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item jsonb; actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor not in ('MASTER', 'WAREHOUSE', 'RUKO', 'LIVE') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_source_location_id is null or p_destination_location_id is null or p_source_location_id = p_destination_location_id or not public.can_access_location(p_source_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID_TRANSFER_REQUEST'; end if;
  if not exists (select 1 from public.locations where id = p_destination_location_id and active) then raise exception 'INVALID_DESTINATION_LOCATION'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::integer, 0) <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if not exists (select 1 from public.products where id = (item->>'product_id')::uuid and active) then raise exception 'PRODUCT_NOT_ACTIVE'; end if;
  end loop;
  insert into public.stock_transfers(source_location_id, destination_location_id, requested_by, notes) values (p_source_location_id, p_destination_location_id, auth.uid(), p_notes) returning * into transfer;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.stock_transfer_items(transfer_id, product_id, shipped_quantity) values (transfer.id, (item->>'product_id')::uuid, (item->>'quantity')::integer);
  end loop;
  insert into public.stock_transfer_events(transfer_id, status, created_by) values (transfer.id, 'DRAFT', auth.uid());
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_source_location_id, 'TRANSFER_CREATED', 'STOCK_TRANSFER', transfer.id, p_notes);
  return transfer;
end $$;

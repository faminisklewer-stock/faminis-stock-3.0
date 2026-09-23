-- Audit fixes: keep this migration separate so an already-applied 0001 remains reproducible.

create table if not exists public.transit_stocks (
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (transfer_id, product_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_transfer_received_lte_shipped'
      and conrelid = 'public.stock_transfer_items'::regclass
  ) then
    alter table public.stock_transfer_items
      add constraint stock_transfer_received_lte_shipped
      check (received_quantity is null or received_quantity <= shipped_quantity);
  end if;
end $$;

create index if not exists transit_stocks_product_idx on public.transit_stocks(product_id);
alter table public.transit_stocks enable row level security;

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true limit 1 $$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() in ('MASTER', 'OWNER'), false) $$;

create or replace function public.require_authenticated()
returns void language plpgsql security definer set search_path = public
as $$ begin if auth.uid() is null or public.current_user_role() is null then raise exception 'UNAUTHENTICATED'; end if; end $$;

-- Avoid recursive profiles policy evaluation and keep self-service role/location changes impossible.
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select using (id = auth.uid() or public.is_manager());

drop policy if exists "scoped purchase read" on public.purchase_receipts;
create policy "scoped purchase read" on public.purchase_receipts for select using (public.can_access_location(location_id));
drop policy if exists "scoped purchase items read" on public.purchase_receipt_items;
create policy "scoped purchase items read" on public.purchase_receipt_items for select using (exists (select 1 from public.purchase_receipts r where r.id = receipt_id and public.can_access_location(r.location_id)));
drop policy if exists "scoped adjustment read" on public.stock_adjustments;
create policy "scoped adjustment read" on public.stock_adjustments for select using (public.can_access_location(location_id));
drop policy if exists "scoped transit read" on public.transit_stocks;
create policy "scoped transit read" on public.transit_stocks for select using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and (public.can_access_location(t.source_location_id) or public.can_access_location(t.destination_location_id))));

create or replace function public.create_transfer(p_source_location_id uuid, p_destination_location_id uuid, p_items jsonb, p_notes text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item jsonb; actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor not in ('MASTER', 'WAREHOUSE', 'RUKO', 'LIVE') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if not public.can_access_location(p_source_location_id) or p_source_location_id = p_destination_location_id then raise exception 'PERMISSION_DENIED'; end if;
  insert into public.stock_transfers(source_location_id, destination_location_id, requested_by, notes) values (p_source_location_id, p_destination_location_id, auth.uid(), p_notes) returning * into transfer;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.stock_transfer_items(transfer_id, product_id, shipped_quantity) values (transfer.id, (item->>'product_id')::uuid, (item->>'quantity')::integer);
  end loop;
  insert into public.stock_transfer_events(transfer_id, status, created_by) values (transfer.id, 'DRAFT', auth.uid());
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_source_location_id, 'TRANSFER_CREATED', 'STOCK_TRANSFER', transfer.id, p_notes);
  return transfer;
end $$;

create or replace function public.record_sale(
  p_location_id uuid, p_items jsonb, p_discount numeric, p_method public.payment_method,
  p_paid_amount numeric, p_idempotency_key uuid
) returns public.transactions language plpgsql security definer set search_path = public
as $$
declare sale public.transactions; item jsonb; subtotal numeric := 0; total numeric := 0; existing public.transactions; actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor not in ('MASTER', 'LIVE', 'RUKO') or not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  select * into existing from public.transactions where idempotency_key = p_idempotency_key;
  if existing.id is not null then return existing; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_CART'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::integer, 0) <= 0 or coalesce((item->>'unit_price')::numeric, -1) < 0 then raise exception 'INVALID_LINE_ITEM'; end if;
    subtotal := subtotal + ((item->>'quantity')::integer * (item->>'unit_price')::numeric);
  end loop;
  total := greatest(0, subtotal - coalesce(p_discount, 0));
  if coalesce(p_paid_amount, 0) < total then raise exception 'INSUFFICIENT_PAYMENT'; end if;
  insert into public.transactions(invoice_no, location_id, created_by, subtotal, discount, grand_total, idempotency_key)
  values (public.next_invoice_number(), p_location_id, auth.uid(), subtotal, greatest(0, coalesce(p_discount, 0)), total, p_idempotency_key) returning * into sale;
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

create or replace function public.record_purchase(p_location_id uuid, p_supplier text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare receipt_id uuid; item jsonb; actor public.app_role;
begin
  perform public.require_authenticated(); actor := public.current_user_role();
  if actor not in ('MASTER', 'WAREHOUSE') or not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  if coalesce(trim(p_supplier), '') = '' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID_PURCHASE'; end if;
  insert into public.purchase_receipts(supplier_name, location_id, created_by) values (p_supplier, p_location_id, auth.uid()) returning id into receipt_id;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::integer, 0) <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    insert into public.purchase_receipt_items(receipt_id, product_id, quantity, purchase_cost) values (receipt_id, (item->>'product_id')::uuid, (item->>'quantity')::integer, nullif(item->>'purchase_cost', '')::numeric);
    insert into public.stocks(product_id, location_id, quantity) values ((item->>'product_id')::uuid, p_location_id, (item->>'quantity')::integer) on conflict (product_id, location_id) do update set quantity = stocks.quantity + excluded.quantity, updated_at = now();
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, p_location_id, 'PURCHASE', (item->>'quantity')::integer, 'PURCHASE_RECEIPT', receipt_id, auth.uid());
  end loop;
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_location_id, 'PURCHASE', 'PURCHASE_RECEIPT', receipt_id, p_supplier);
  return receipt_id;
end $$;

create or replace function public.adjust_stock(p_product_id uuid, p_location_id uuid, p_physical_quantity integer, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare current_quantity integer; adjustment_id uuid; delta integer; actor public.app_role;
begin
  perform public.require_authenticated(); actor := public.current_user_role();
  if actor not in ('MASTER', 'WAREHOUSE') or not public.can_access_location(p_location_id) or p_physical_quantity < 0 or coalesce(trim(p_reason), '') = '' then raise exception 'PERMISSION_DENIED'; end if;
  select quantity into current_quantity from public.stocks where product_id = p_product_id and location_id = p_location_id for update;
  if current_quantity is null then raise exception 'STOCK_NOT_FOUND'; end if;
  delta := p_physical_quantity - current_quantity;
  insert into public.stock_adjustments(product_id, location_id, system_quantity, physical_quantity, reason, created_by) values (p_product_id, p_location_id, current_quantity, p_physical_quantity, p_reason, auth.uid()) returning id into adjustment_id;
  update public.stocks set quantity = p_physical_quantity, updated_at = now() where product_id = p_product_id and location_id = p_location_id;
  if delta <> 0 then insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (p_product_id, p_location_id, 'ADJUSTMENT', delta, 'STOCK_ADJUSTMENT', adjustment_id, auth.uid()); end if;
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_location_id, 'STOCK_ADJUSTMENT', 'STOCK_ADJUSTMENT', adjustment_id, p_reason);
  return adjustment_id;
end $$;

create or replace function public.transition_transfer(p_transfer_id uuid, p_next_status public.transfer_status, p_note text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item record; current_status public.transfer_status; actor public.app_role; received integer;
begin
  perform public.require_authenticated(); actor := public.current_user_role();
  select * into transfer from public.stock_transfers where id = p_transfer_id for update;
  if transfer.id is null or not (public.can_access_location(transfer.source_location_id) or public.can_access_location(transfer.destination_location_id)) then raise exception 'PERMISSION_DENIED'; end if;
  current_status := transfer.status;
  if current_status = 'DRAFT' and p_next_status in ('REQUESTED','CANCELLED') then null;
  elsif current_status = 'REQUESTED' and p_next_status = 'REJECTED' and actor in ('MASTER','OWNER','WAREHOUSE') then null;
  elsif current_status = 'REQUESTED' and p_next_status = 'APPROVED' and actor in ('MASTER','OWNER','WAREHOUSE') then null;
  elsif current_status = 'APPROVED' and p_next_status = 'SHIPPED' and actor in ('MASTER','WAREHOUSE') then null;
  elsif current_status = 'APPROVED' and p_next_status = 'CANCELLED' and actor in ('MASTER','OWNER','WAREHOUSE') then null;
  elsif current_status = 'SHIPPED' and p_next_status = 'RECEIVED' and public.can_access_location(transfer.destination_location_id) then null;
  elsif current_status = 'RECEIVED' and p_next_status = 'COMPLETED' and actor in ('MASTER','OWNER','WAREHOUSE') then null;
  else raise exception 'INVALID_TRANSFER_TRANSITION'; end if;
  if p_next_status = 'SHIPPED' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      update public.stocks set quantity = quantity - item.shipped_quantity, updated_at = now() where product_id = item.product_id and location_id = transfer.source_location_id and quantity >= item.shipped_quantity;
      if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
      insert into public.transit_stocks(transfer_id, product_id, quantity) values (p_transfer_id, item.product_id, item.shipped_quantity);
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (item.product_id, transfer.source_location_id, 'TRANSFER_OUT', -item.shipped_quantity, 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  elsif p_next_status = 'RECEIVED' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      received := coalesce(item.received_quantity, item.shipped_quantity);
      if received < 0 or received > item.shipped_quantity then raise exception 'INVALID_RECEIVED_QUANTITY'; end if;
      if not exists (select 1 from public.transit_stocks where transfer_id = p_transfer_id and product_id = item.product_id) then raise exception 'TRANSIT_STOCK_NOT_FOUND'; end if;
      delete from public.transit_stocks where transfer_id = p_transfer_id and product_id = item.product_id;
      update public.stock_transfer_items set received_quantity = received where id = item.id;
      insert into public.stocks(product_id, location_id, quantity) values (item.product_id, transfer.destination_location_id, received) on conflict (product_id, location_id) do update set quantity = stocks.quantity + excluded.quantity, updated_at = now();
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (item.product_id, transfer.destination_location_id, 'TRANSFER_IN', received, 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  end if;
  update public.stock_transfers set status = p_next_status, approved_by = case when p_next_status = 'APPROVED' then auth.uid() else approved_by end, shipped_at = case when p_next_status = 'SHIPPED' then now() else shipped_at end, received_at = case when p_next_status = 'RECEIVED' then now() else received_at end where id = p_transfer_id returning * into transfer;
  insert into public.stock_transfer_events(transfer_id, status, created_by, note) values (p_transfer_id, p_next_status, auth.uid(), p_note);
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, transfer.source_location_id, 'TRANSFER_' || p_next_status::text, 'STOCK_TRANSFER', p_transfer_id, p_note);
  return transfer;
end $$;

drop policy if exists "transit visibility" on public.transit_stocks;
create policy "transit visibility" on public.transit_stocks for select using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and (public.can_access_location(t.source_location_id) or public.can_access_location(t.destination_location_id))));

revoke all on function public.current_profile() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon, authenticated;
revoke all on function public.is_manager() from public, anon, authenticated;
revoke all on function public.require_authenticated() from public, anon, authenticated;
revoke all on function public.can_access_location(uuid) from public, anon, authenticated;
revoke all on function public.next_invoice_number() from public, anon, authenticated;
revoke all on function public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid) from public, anon;
revoke all on function public.record_purchase(uuid, text, jsonb) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, integer, text) from public, anon;
revoke all on function public.transition_transfer(uuid, public.transfer_status, text) from public, anon;
revoke all on function public.create_transfer(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid) to authenticated;
grant execute on function public.record_purchase(uuid, text, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text) to authenticated;
grant execute on function public.transition_transfer(uuid, public.transfer_status, text) to authenticated;
grant execute on function public.create_transfer(uuid, uuid, jsonb, text) to authenticated;

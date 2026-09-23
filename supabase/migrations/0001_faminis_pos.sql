create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    create type public.app_role as enum ('MASTER', 'OWNER', 'WAREHOUSE', 'LIVE', 'RUKO');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'payment_method') then
    create type public.payment_method as enum ('CASH', 'QRIS', 'TRANSFER', 'DEBIT', 'CREDIT');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'movement_type') then
    create type public.movement_type as enum ('PURCHASE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'RETURN');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'transfer_status') then
    create type public.transfer_status as enum ('DRAFT', 'REQUESTED', 'APPROVED', 'SHIPPED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED');
  end if;
end $$;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('WAREHOUSE', 'LIVE', 'STORE')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  location_id uuid references public.locations(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role in ('MASTER', 'OWNER') and location_id is null) or role in ('WAREHOUSE', 'LIVE', 'RUKO'))
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.categories(id),
  variant text,
  grade text,
  size text,
  motif text,
  color text,
  material text,
  unit text not null default 'pcs',
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stocks (
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  location_id uuid not null references public.locations(id),
  created_by uuid not null references public.profiles(id),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  grand_total numeric(14,2) not null check (grand_total >= 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  method public.payment_method not null,
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  movement_type public.movement_type not null,
  quantity integer not null check (quantity <> 0),
  reference_type text not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  location_id uuid not null references public.locations(id),
  created_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now()
);

create table if not exists public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  purchase_cost numeric(14,2) check (purchase_cost is null or purchase_cost >= 0)
);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  source_location_id uuid not null references public.locations(id),
  destination_location_id uuid not null references public.locations(id),
  status public.transfer_status not null default 'DRAFT',
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  shipped_at timestamptz,
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  check (source_location_id <> destination_location_id)
);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  shipped_quantity integer not null check (shipped_quantity > 0),
  received_quantity integer check (received_quantity is null or received_quantity >= 0),
  discrepancy_reason text
);

create table if not exists public.stock_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  status public.transfer_status not null,
  created_by uuid not null references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  system_quantity integer not null,
  physical_quantity integer not null check (physical_quantity >= 0),
  difference integer generated always as (physical_quantity - system_quantity) stored,
  reason text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  role public.app_role,
  location_id uuid references public.locations(id),
  action text not null,
  reference_type text,
  reference_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create index if not exists stocks_location_idx on public.stocks(location_id);
create index if not exists transactions_location_date_idx on public.transactions(location_id, created_at desc);
create index if not exists transaction_items_transaction_idx on public.transaction_items(transaction_id);
create index if not exists transaction_items_product_idx on public.transaction_items(product_id);
create index if not exists movements_product_location_date_idx on public.stock_movements(product_id, location_id, created_at desc);
create index if not exists transfers_source_status_idx on public.stock_transfers(source_location_id, status);
create index if not exists transfers_destination_status_idx on public.stock_transfers(destination_location_id, status);
create index if not exists transfer_items_transfer_idx on public.stock_transfer_items(transfer_id);
create index if not exists audit_location_date_idx on public.audit_logs(location_id, created_at desc);

create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path = public
as $$ select * from public.profiles where id = auth.uid() and active = true limit 1 $$;

create or replace function public.can_access_location(target_location uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and (p.role in ('MASTER','OWNER') or p.location_id = target_location)) $$;

create or replace function public.next_invoice_number()
returns text language plpgsql security definer set search_path = public
as $$
declare next_number integer; prefix text := 'FB-' || to_char(current_date, 'YYYYMMDD') || '-';
begin
  perform pg_advisory_xact_lock(hashtext(prefix));
  select coalesce(max(right(invoice_no, 4)::integer), 0) + 1 into next_number from public.transactions where invoice_no like prefix || '%';
  return prefix || lpad(next_number::text, 4, '0');
end $$;

create or replace function public.record_sale(
  p_location_id uuid, p_items jsonb, p_discount numeric, p_method public.payment_method,
  p_paid_amount numeric, p_idempotency_key uuid
) returns public.transactions language plpgsql security definer set search_path = public
as $$
declare sale public.transactions; item jsonb; line_total numeric := 0; subtotal numeric := 0; total numeric := 0; existing public.transactions;
begin
  if not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  select * into existing from public.transactions where idempotency_key = p_idempotency_key;
  if existing.id is not null then return existing; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    subtotal := subtotal + ((item->>'quantity')::integer * (item->>'unit_price')::numeric);
  end loop;
  total := greatest(0, subtotal - coalesce(p_discount, 0));
  if p_paid_amount < total then raise exception 'INSUFFICIENT_PAYMENT'; end if;
  insert into public.transactions(invoice_no, location_id, created_by, subtotal, discount, grand_total, idempotency_key)
  values (public.next_invoice_number(), p_location_id, auth.uid(), subtotal, coalesce(p_discount, 0), total, p_idempotency_key) returning * into sale;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.transaction_items(transaction_id, product_id, quantity, unit_price) values (sale.id, (item->>'product_id')::uuid, (item->>'quantity')::integer, (item->>'unit_price')::numeric);
    update public.stocks set quantity = quantity - (item->>'quantity')::integer, updated_at = now() where product_id = (item->>'product_id')::uuid and location_id = p_location_id and quantity >= (item->>'quantity')::integer;
    if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, p_location_id, 'SALE', -((item->>'quantity')::integer), 'TRANSACTION', sale.id, auth.uid());
  end loop;
  insert into public.payments(transaction_id, method, paid_amount, change_amount) values (sale.id, p_method, p_paid_amount, p_paid_amount - total);
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) select auth.uid(), role, p_location_id, 'SALE', 'TRANSACTION', sale.id, sale.invoice_no from public.profiles where id = auth.uid();
  return sale;
end $$;

alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stocks enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.stock_transfer_events enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

drop policy if exists "active users read locations" on public.locations;
create policy "active users read locations" on public.locations for select using (exists (select 1 from public.profiles where id = auth.uid() and active));
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select using (id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role in ('MASTER','OWNER')));
drop policy if exists "scoped catalog read" on public.categories;
create policy "scoped catalog read" on public.categories for select using (exists (select 1 from public.profiles where id = auth.uid() and active));
drop policy if exists "scoped product read" on public.products;
create policy "scoped product read" on public.products for select using (exists (select 1 from public.profiles where id = auth.uid() and active));
drop policy if exists "scoped stock read" on public.stocks;
create policy "scoped stock read" on public.stocks for select using (public.can_access_location(location_id));
drop policy if exists "scoped transaction read" on public.transactions;
create policy "scoped transaction read" on public.transactions for select using (public.can_access_location(location_id));
drop policy if exists "scoped movement read" on public.stock_movements;
create policy "scoped movement read" on public.stock_movements for select using (public.can_access_location(location_id));
drop policy if exists "scoped audit read" on public.audit_logs;
create policy "scoped audit read" on public.audit_logs for select using (public.can_access_location(location_id) or exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER'));
drop policy if exists "scoped transfer read" on public.stock_transfers;
create policy "scoped transfer read" on public.stock_transfers for select using (public.can_access_location(source_location_id) or public.can_access_location(destination_location_id));
drop policy if exists "transfer items read" on public.stock_transfer_items;
create policy "transfer items read" on public.stock_transfer_items for select using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and (public.can_access_location(t.source_location_id) or public.can_access_location(t.destination_location_id))));
drop policy if exists "transfer events read" on public.stock_transfer_events;
create policy "transfer events read" on public.stock_transfer_events for select using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and (public.can_access_location(t.source_location_id) or public.can_access_location(t.destination_location_id))));
drop policy if exists "transaction items read" on public.transaction_items;
create policy "transaction items read" on public.transaction_items for select using (exists (select 1 from public.transactions t where t.id = transaction_id and public.can_access_location(t.location_id)));
drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments for select using (exists (select 1 from public.transactions t where t.id = transaction_id and public.can_access_location(t.location_id)));
drop policy if exists "master writes catalog" on public.products;
create policy "master writes catalog" on public.products for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER'));
drop policy if exists "master writes categories" on public.categories;
create policy "master writes categories" on public.categories for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER'));
drop policy if exists "master writes settings" on public.settings;
create policy "master writes settings" on public.settings for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'MASTER'));

grant execute on function public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid) to authenticated;
grant execute on function public.next_invoice_number() to authenticated;

create or replace function public.record_purchase(p_location_id uuid, p_supplier text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare receipt_id uuid; item jsonb;
begin
  if not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  insert into public.purchase_receipts(supplier_name, location_id, created_by) values (p_supplier, p_location_id, auth.uid()) returning id into receipt_id;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.purchase_receipt_items(receipt_id, product_id, quantity, purchase_cost) values (receipt_id, (item->>'product_id')::uuid, (item->>'quantity')::integer, nullif(item->>'purchase_cost', '')::numeric);
    insert into public.stocks(product_id, location_id, quantity) values ((item->>'product_id')::uuid, p_location_id, (item->>'quantity')::integer)
      on conflict (product_id, location_id) do update set quantity = stocks.quantity + excluded.quantity, updated_at = now();
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, p_location_id, 'PURCHASE', (item->>'quantity')::integer, 'PURCHASE_RECEIPT', receipt_id, auth.uid());
  end loop;
  insert into public.audit_logs(user_id, location_id, action, reference_type, reference_id, description) values (auth.uid(), p_location_id, 'PURCHASE', 'PURCHASE_RECEIPT', receipt_id, p_supplier);
  return receipt_id;
end $$;

create or replace function public.adjust_stock(p_product_id uuid, p_location_id uuid, p_physical_quantity integer, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare current_quantity integer; adjustment_id uuid; delta integer;
begin
  if not public.can_access_location(p_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  select quantity into current_quantity from public.stocks where product_id = p_product_id and location_id = p_location_id for update;
  if current_quantity is null then raise exception 'STOCK_NOT_FOUND'; end if;
  delta := p_physical_quantity - current_quantity;
  insert into public.stock_adjustments(product_id, location_id, system_quantity, physical_quantity, reason, created_by) values (p_product_id, p_location_id, current_quantity, p_physical_quantity, p_reason, auth.uid()) returning id into adjustment_id;
  update public.stocks set quantity = p_physical_quantity, updated_at = now() where product_id = p_product_id and location_id = p_location_id;
  if delta <> 0 then insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (p_product_id, p_location_id, 'ADJUSTMENT', delta, 'STOCK_ADJUSTMENT', adjustment_id, auth.uid()); end if;
  insert into public.audit_logs(user_id, location_id, action, reference_type, reference_id, description) values (auth.uid(), p_location_id, 'STOCK_ADJUSTMENT', 'STOCK_ADJUSTMENT', adjustment_id, p_reason);
  return adjustment_id;
end $$;

create or replace function public.transition_transfer(p_transfer_id uuid, p_next_status public.transfer_status, p_note text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item jsonb; current_status public.transfer_status; allowed boolean := false;
begin
  select * into transfer from public.stock_transfers where id = p_transfer_id for update;
  if transfer.id is null or not (public.can_access_location(transfer.source_location_id) or public.can_access_location(transfer.destination_location_id)) then raise exception 'PERMISSION_DENIED'; end if;
  current_status := transfer.status;
  allowed := (current_status = 'DRAFT' and p_next_status in ('REQUESTED','CANCELLED')) or (current_status = 'REQUESTED' and p_next_status in ('APPROVED','REJECTED')) or (current_status = 'APPROVED' and p_next_status in ('SHIPPED','CANCELLED')) or (current_status = 'SHIPPED' and p_next_status = 'RECEIVED') or (current_status = 'RECEIVED' and p_next_status = 'COMPLETED');
  if not allowed then raise exception 'INVALID_TRANSFER_TRANSITION'; end if;
  if p_next_status = 'SHIPPED' then
    for item in select to_jsonb(i) from public.stock_transfer_items i where i.transfer_id = p_transfer_id loop
      update public.stocks set quantity = quantity - (item->>'shipped_quantity')::integer, updated_at = now() where product_id = (item->>'product_id')::uuid and location_id = transfer.source_location_id and quantity >= (item->>'shipped_quantity')::integer;
      if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
      insert into public.stocks(product_id, location_id, quantity) values ((item->>'product_id')::uuid, transfer.source_location_id, 0) on conflict do nothing;
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, transfer.source_location_id, 'TRANSFER_OUT', -((item->>'shipped_quantity')::integer), 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  elsif p_next_status = 'RECEIVED' then
    for item in select to_jsonb(i) from public.stock_transfer_items i where i.transfer_id = p_transfer_id loop
      update public.stocks set quantity = quantity - (item->>'shipped_quantity')::integer + coalesce((item->>'received_quantity')::integer, (item->>'shipped_quantity')::integer), updated_at = now() where product_id = (item->>'product_id')::uuid and location_id = transfer.destination_location_id;
      if not found then insert into public.stocks(product_id, location_id, quantity) values ((item->>'product_id')::uuid, transfer.destination_location_id, coalesce((item->>'received_quantity')::integer, (item->>'shipped_quantity')::integer)); end if;
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, transfer.destination_location_id, 'TRANSFER_IN', coalesce((item->>'received_quantity')::integer, (item->>'shipped_quantity')::integer), 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  end if;
  update public.stock_transfers set status = p_next_status, approved_by = case when p_next_status = 'APPROVED' then auth.uid() else approved_by end, shipped_at = case when p_next_status = 'SHIPPED' then now() else shipped_at end, received_at = case when p_next_status = 'RECEIVED' then now() else received_at end where id = p_transfer_id returning * into transfer;
  insert into public.stock_transfer_events(transfer_id, status, created_by, note) values (p_transfer_id, p_next_status, auth.uid(), p_note);
  insert into public.audit_logs(user_id, location_id, action, reference_type, reference_id, description) values (auth.uid(), transfer.source_location_id, 'TRANSFER_' || p_next_status::text, 'STOCK_TRANSFER', p_transfer_id, p_note);
  return transfer;
end $$;

grant execute on function public.record_purchase(uuid, text, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text) to authenticated;
grant execute on function public.transition_transfer(uuid, public.transfer_status, text) to authenticated;

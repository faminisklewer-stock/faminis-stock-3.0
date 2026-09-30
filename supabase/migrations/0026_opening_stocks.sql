create table if not exists public.opening_stocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null check (quantity >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (product_id, location_id)
);

alter table public.opening_stocks enable row level security;
revoke all on table public.opening_stocks from anon, authenticated;
grant select on table public.opening_stocks to authenticated;

create policy "master reads opening stocks" on public.opening_stocks
for select using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'MASTER' and active
  )
);

create or replace function public.set_opening_stock(
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
  if not exists (select 1 from public.products where id = p_product_id and active)
     or not exists (select 1 from public.locations where id = p_location_id and active) then
    raise exception 'INVALID_PRODUCT_OR_LOCATION';
  end if;
  if exists (
    select 1 from public.opening_stocks
    where product_id = p_product_id and location_id = p_location_id
  ) then
    raise exception 'OPENING_STOCK_ALREADY_SET';
  end if;

  select quantity, reserved_quantity
  into current_quantity, current_reserved
  from public.stocks
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if found and (current_quantity <> 0 or current_reserved <> 0) then
    raise exception 'STOCK_NOT_EMPTY';
  end if;

  insert into public.opening_stocks(product_id, location_id, quantity, created_by)
  values (p_product_id, p_location_id, p_quantity, auth.uid())
  returning id into opening_stock_id;

  insert into public.stocks(product_id, location_id, quantity, reserved_quantity, updated_at)
  values (p_product_id, p_location_id, p_quantity, 0, now())
  on conflict (product_id, location_id) do update
    set quantity = excluded.quantity,
        reserved_quantity = 0,
        updated_at = now();

  if p_quantity > 0 then
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by)
    values (p_product_id, p_location_id, 'ADJUSTMENT', p_quantity, 'OPENING_STOCK', opening_stock_id, auth.uid());
  end if;

  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description)
  values (auth.uid(), actor, p_location_id, 'OPENING_STOCK_SET', 'OPENING_STOCK', opening_stock_id, 'Stok awal ditetapkan untuk produk pada lokasi.');

  return opening_stock_id;
end;
$$;

revoke all on function public.set_opening_stock(uuid, uuid, integer) from public, anon;
grant execute on function public.set_opening_stock(uuid, uuid, integer) to authenticated;
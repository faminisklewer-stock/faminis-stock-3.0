create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  segment text not null default 'Retail' check (segment in ('Retail', 'Reseller', 'B2B', 'UMKM')),
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create index if not exists customers_name_idx on public.customers (full_name);

create policy "active users read customers" on public.customers
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active)
);

create policy "master warehouse manage customers" on public.customers
for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('MASTER', 'WAREHOUSE') and active
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('MASTER', 'WAREHOUSE') and active
  )
);

create policy "master manages profiles" on public.profiles
for update
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'MASTER' and active
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'MASTER' and active
  )
);

create policy "master inserts profiles" on public.profiles
for insert
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'MASTER' and active
  )
);

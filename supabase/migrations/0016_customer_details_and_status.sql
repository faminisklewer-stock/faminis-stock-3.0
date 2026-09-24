alter table public.customers
  add column if not exists address text,
  add column if not exists status text not null default 'Aktif' check (status in ('Aktif', 'Potensial', 'VIP', 'Nonaktif'));

create or replace function public.ensure_customer_columns()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'address'
  ) then
    alter table public.customers add column address text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'status'
  ) then
    alter table public.customers add column status text not null default 'Aktif';
    alter table public.customers
      add constraint customers_status_check
      check (status in ('Aktif', 'Potensial', 'VIP', 'Nonaktif'));
  end if;
end $$;

select public.ensure_customer_columns();

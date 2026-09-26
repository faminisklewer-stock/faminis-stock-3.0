create or replace function public.can_access_location(target_location uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and (
        p.role in ('MASTER', 'OWNER')
        or (
          p.location_id = target_location
          and (
            p.role <> 'WAREHOUSE'
            or exists (
              select 1 from public.locations l
              where l.id = p.location_id and l.kind = 'WAREHOUSE'
            )
          )
        )
      )
  )
$$;

create or replace function public.enforce_warehouse_profile_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'WAREHOUSE' and not exists (
    select 1 from public.locations
    where id = new.location_id and kind = 'WAREHOUSE'
  ) then
    raise exception using
      errcode = '23514',
      message = 'WAREHOUSE_LOCATION_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_require_warehouse_location on public.profiles;
create trigger profiles_require_warehouse_location
before insert or update of role, location_id on public.profiles
for each row execute function public.enforce_warehouse_profile_location();

create or replace function public.get_stock_report()
returns table(product_id uuid, location_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.product_id, s.location_id, s.quantity
  from public.stocks s
  where public.can_access_location(s.location_id);
$$;
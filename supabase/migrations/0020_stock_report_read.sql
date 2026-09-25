create or replace function public.get_stock_report()
returns table(product_id uuid, location_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.product_id, s.location_id, s.quantity
  from public.stocks s
  where public.current_user_role() is not null;
$$;

revoke all on function public.get_stock_report() from public, anon;
grant execute on function public.get_stock_report() to authenticated;

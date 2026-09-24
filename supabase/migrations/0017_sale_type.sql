do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'sale_type') then
    create type public.sale_type as enum ('ECER', 'GROSIR');
  end if;
end $$;

alter table public.transactions
  add column if not exists sale_type public.sale_type not null default 'ECER';

-- Keep the existing six-argument call compatible through the defaulted seventh argument.
drop function if exists public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid);

create or replace function public.record_sale(
  p_location_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_method public.payment_method,
  p_paid_amount numeric,
  p_idempotency_key uuid,
  p_sale_type public.sale_type default 'ECER'
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
  insert into public.transactions(invoice_no, location_id, created_by, subtotal, discount, grand_total, idempotency_key, sale_type)
  values (public.next_invoice_number(), p_location_id, auth.uid(), subtotal, p_discount, total, p_idempotency_key, p_sale_type) returning * into sale;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.transaction_items(transaction_id, product_id, quantity, unit_price) values (sale.id, (item->>'product_id')::uuid, (item->>'quantity')::integer, (item->>'unit_price')::numeric);
    update public.stocks set quantity = quantity - (item->>'quantity')::integer, updated_at = now() where product_id = (item->>'product_id')::uuid and location_id = p_location_id and quantity >= (item->>'quantity')::integer;
    if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
    insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values ((item->>'product_id')::uuid, p_location_id, 'SALE', -((item->>'quantity')::integer), 'TRANSACTION', sale.id, auth.uid());
  end loop;
  insert into public.payments(transaction_id, method, paid_amount, change_amount) values (sale.id, p_method, p_paid_amount, p_paid_amount - total);
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description, metadata) values (auth.uid(), actor, p_location_id, 'SALE', 'TRANSACTION', sale.id, sale.invoice_no, jsonb_build_object('sale_type', p_sale_type));
  return sale;
end $$;

grant execute on function public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid, public.sale_type) to authenticated;
revoke all on function public.record_sale(uuid, jsonb, numeric, public.payment_method, numeric, uuid, public.sale_type) from public, anon;

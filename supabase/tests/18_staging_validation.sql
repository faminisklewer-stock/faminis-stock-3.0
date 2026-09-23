-- ============================================================
-- Staging validation bundle for Faminis POS
-- Run ONLY in isolated staging / QA Supabase project.
-- This script validates role access, stock integrity, transfer flow,
-- partial receiving, idempotency, and final audit consistency.
-- ============================================================

-- 0) Helper functions for auth impersonation in staging.
-- These let SQL run as a test user without opening a separate client.
create or replace function public.as_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated'
  )::text, true);
end;
$$;

create or replace function public.reset_user_context()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- 1) Discover test identities and data available in staging.
select
  p.role,
  p.id as user_id,
  p.email,
  p.location_id,
  p.active
from public.profiles p
order by p.role, p.email;

select
  l.id as location_id,
  l.name as location_name,
  l.kind
from public.locations l
order by l.name;

select
  pr.id as product_id,
  pr.sku,
  pr.name,
  pr.active,
  coalesce(s.quantity, 0) as stock_quantity
from public.products pr
left join public.stocks s on s.product_id = pr.id
order by pr.name
limit 50;

-- 2) Structural sanity checks.
do $$
declare
  missing text;
begin
  select string_agg(required_name, ', ' order by required_name)
    into missing
  from (values
    ('profiles'), ('locations'), ('products'), ('stocks'), ('transactions'),
    ('transaction_items'), ('payments'), ('purchase_receipts'),
    ('purchase_receipt_items'), ('stock_movements'), ('stock_adjustments'),
    ('stock_transfers'), ('stock_transfer_items'), ('stock_transfer_events'),
    ('transit_stocks'), ('audit_logs')
  ) as required(required_name)
  where not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = required.required_name
  );

  if missing is not null then
    raise exception 'MISSING_OPERATIONAL_TABLES: %', missing;
  end if;
end $$;

-- 3) RLS must be enabled on operational tables.
do $$
declare
  missing text;
begin
  select string_agg(required_name, ', ' order by required_name)
    into missing
  from (values
    ('profiles'), ('locations'), ('products'), ('stocks'), ('transactions'),
    ('transaction_items'), ('payments'), ('purchase_receipts'),
    ('purchase_receipt_items'), ('stock_movements'), ('stock_adjustments'),
    ('stock_transfers'), ('stock_transfer_items'), ('stock_transfer_events'),
    ('transit_stocks'), ('audit_logs')
  ) as required(required_name)
  where not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = required.required_name
      and c.relrowsecurity
  );

  if missing is not null then
    raise exception 'RLS_DISABLED_ON: %', missing;
  end if;
end $$;

-- 4) Role matrix validation.
-- Run each block below sequentially; each block sets auth context to a test role.

-- MASTER
select public.as_user((select id from public.profiles where role = 'MASTER' limit 1));
select public.current_user_role() as current_role;
select count(*) as accessable_locations from public.locations where public.can_access_location(id);

-- OWNER
select public.as_user((select id from public.profiles where role = 'OWNER' limit 1));
select public.current_user_role() as current_role;
select count(*) as accessable_locations from public.locations where public.can_access_location(id);

-- WAREHOUSE
select public.as_user((select id from public.profiles where role = 'WAREHOUSE' limit 1));
select public.current_user_role() as current_role;
select count(*) as accessable_locations from public.locations where public.can_access_location(id);

-- LIVE
select public.as_user((select id from public.profiles where role = 'LIVE' limit 1));
select public.current_user_role() as current_role;
select count(*) as accessable_locations from public.locations where public.can_access_location(id);

-- RUKO
select public.as_user((select id from public.profiles where role = 'RUKO' limit 1));
select public.current_user_role() as current_role;
select
  (select count(*) from public.locations where public.can_access_location(id)) as accessable_locations,
  (select count(*) from public.stock_transfers where public.can_access_location(source_location_id) or public.can_access_location(destination_location_id)) as visible_transfers;

-- Reset auth context before functional tests.
select public.reset_user_context();

-- 5) Purchase scenario (WAREHOUSE or MASTER only).
-- Ensure there is at least one product and one location selected.
do $$
declare
  v_warehouse_id uuid;
  v_location_id uuid;
  v_product_id uuid;
  v_receipt_id uuid;
  v_quantity integer := 25;
begin
  select id into v_warehouse_id from public.profiles where role = 'WAREHOUSE' limit 1;
  select id into v_location_id from public.locations order by name limit 1;
  select id into v_product_id from public.products where active = true order by name limit 1;

  if v_warehouse_id is null or v_location_id is null or v_product_id is null then
    raise exception 'NEED_ACTIVE_WAREHOUSE_USER_LOCATION_AND_PRODUCT_FOR_PURCHASE_TEST';
  end if;

  perform public.as_user(v_warehouse_id);
  select public.record_purchase(v_location_id, 'STAGING SUPPLIER', jsonb_build_array(
    jsonb_build_object(
      'product_id', v_product_id,
      'quantity', v_quantity,
      'purchase_cost', 12000
    )
  )) into v_receipt_id;

  raise notice 'PURCHASE_OK: receipt_id=% location_id=% product_id=% quantity=%', v_receipt_id, v_location_id, v_product_id, v_quantity;
end $$;

-- 6) Sale scenario + stock validation.
do $$
declare
  v_live_id uuid;
  v_location_id uuid;
  v_product_id uuid;
  v_sale public.transactions;
  v_stock_after integer;
  v_key uuid := gen_random_uuid();
begin
  select id into v_live_id from public.profiles where role = 'LIVE' limit 1;
  select id into v_location_id from public.locations order by name limit 1;
  select s.product_id into v_product_id
  from public.stocks s
  where s.location_id = v_location_id
  order by s.quantity desc
  limit 1;

  if v_live_id is null or v_location_id is null or v_product_id is null then
    raise exception 'NEED_ACTIVE_LIVE_USER_LOCATION_AND_STOCKED_PRODUCT_FOR_SALE_TEST';
  end if;

  perform public.as_user(v_live_id);
  select public.record_sale(
    v_location_id,
    jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'quantity', 2,
        'unit_price', 150000
      )
    ),
    0,
    'CASH'::public.payment_method,
    300000,
    v_key
  ) into v_sale;

  select quantity into v_stock_after
  from public.stocks
  where product_id = v_product_id and location_id = v_location_id;

  raise notice 'SALE_OK: transaction_id=% invoice_no=% key=% remaining_stock=%', v_sale.id, v_sale.invoice_no, v_key, v_stock_after;
end $$;

-- 7) Repeat same idempotency key must not create duplicate transactions.
do $$
declare
  v_live_id uuid;
  v_location_id uuid;
  v_product_id uuid;
  v_key uuid := gen_random_uuid();
  v_total integer;
  v_1 public.transactions;
  v_2 public.transactions;
begin
  select id into v_live_id from public.profiles where role = 'LIVE' limit 1;
  select id into v_location_id from public.locations order by name limit 1;
  select s.product_id into v_product_id
  from public.stocks s
  where s.location_id = v_location_id
  order by s.quantity desc
  limit 1;

  if v_live_id is null or v_location_id is null or v_product_id is null then
    raise exception 'NEED_ACTIVE_LIVE_USER_LOCATION_AND_STOCKED_PRODUCT_FOR_IDEMPOTENCY_TEST';
  end if;

  perform public.as_user(v_live_id);
  select public.record_sale(
    v_location_id,
    jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_price', 100000)),
    0,
    'CASH'::public.payment_method,
    100000,
    v_key
  ) into v_1;

  select public.record_sale(
    v_location_id,
    jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_price', 100000)),
    0,
    'CASH'::public.payment_method,
    100000,
    v_key
  ) into v_2;

  select count(*) into v_total
  from public.transactions
  where idempotency_key = v_key;

  if v_total <> 1 then
    raise exception 'IDEMPOTENCY_FAIL: expected exactly 1 transaction, got %', v_total;
  end if;

  raise notice 'IDEMPOTENCY_OK: duplicate key=% created_transactions=%', v_key, v_total;
end $$;

-- 8) Transfer lifecycle: DRAFT -> REQUESTED -> APPROVED -> SHIPPED -> RECEIVED -> COMPLETED.
do $$
declare
  v_warehouse_id uuid;
  v_master_id uuid;
  v_location_a uuid;
  v_location_b uuid;
  v_product_id uuid;
  v_transfer public.stock_transfers;
  v_item record;
begin
  select id into v_warehouse_id from public.profiles where role = 'WAREHOUSE' limit 1;
  select id into v_master_id from public.profiles where role = 'MASTER' limit 1;
  select id into v_location_a from public.locations order by name limit 1;
  select id into v_location_b from public.locations order by name offset 1 limit 1;
  select s.product_id into v_product_id
  from public.stocks s
  where s.location_id = v_location_a
  order by s.quantity desc
  limit 1;

  if v_warehouse_id is null or v_master_id is null or v_location_a is null or v_location_b is null or v_product_id is null then
    raise exception 'NEED_COMPLETE_LOCATION_AND_PRODUCT_DATA_FOR_TRANSFER_FLOW';
  end if;

  perform public.as_user(v_warehouse_id);
  select public.create_transfer(
    v_location_a,
    v_location_b,
    jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 5)),
    'STAGING VALIDATION TRANSFER'
  ) into v_transfer;

  if v_transfer.status <> 'DRAFT' then
    raise exception 'TRANSFER_DRAFT_STATUS_FAILED: status=%', v_transfer.status;
  end if;

  perform public.as_user(v_master_id);
  select public.transition_transfer(v_transfer.id, 'REQUESTED', 'approved by master') into v_transfer;
  select public.transition_transfer(v_transfer.id, 'APPROVED', 'approved by owner') into v_transfer;
  select public.transition_transfer(v_transfer.id, 'SHIPPED', 'shipped to destination') into v_transfer;

  if v_transfer.status <> 'SHIPPED' then
    raise exception 'TRANSFER_SHIPPED_STATUS_FAILED: status=%', v_transfer.status;
  end if;

  -- simulate destination receiving user
  perform public.as_user((select id from public.profiles where role = 'LIVE' and location_id = v_location_b limit 1));
  select public.receive_transfer(
    v_transfer.id,
    jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'received_quantity', 5,
        'discrepancy_reason', null
      )
    ),
    null
  ) into v_transfer;

  if v_transfer.status <> 'RECEIVED' then
    raise exception 'TRANSFER_RECEIVED_STATUS_FAILED: status=%', v_transfer.status;
  end if;

  perform public.as_user(v_master_id);
  select public.transition_transfer(v_transfer.id, 'COMPLETED', 'closed') into v_transfer;

  if v_transfer.status <> 'COMPLETED' then
    raise exception 'TRANSFER_COMPLETED_STATUS_FAILED: status=%', v_transfer.status;
  end if;

  raise notice 'TRANSFER_FLOW_OK: transfer_id=% final_status=%', v_transfer.id, v_transfer.status;
end $$;

-- 9) Partial receiving without discrepancy reason must fail.
do $$
declare
  v_warehouse_id uuid;
  v_master_id uuid;
  v_location_a uuid;
  v_location_b uuid;
  v_product_id uuid;
  v_transfer public.stock_transfers;
  v_err text;
begin
  select id into v_warehouse_id from public.profiles where role = 'WAREHOUSE' limit 1;
  select id into v_master_id from public.profiles where role = 'MASTER' limit 1;
  select id into v_location_a from public.locations order by name limit 1;
  select id into v_location_b from public.locations order by name offset 1 limit 1;
  select s.product_id into v_product_id
  from public.stocks s
  where s.location_id = v_location_a
  order by s.quantity desc
  limit 1;

  if v_warehouse_id is null or v_master_id is null or v_location_a is null or v_location_b is null or v_product_id is null then
    raise exception 'NEED_COMPLETE_LOCATION_AND_PRODUCT_DATA_FOR_PARTIAL_RECEIVE_TEST';
  end if;

  perform public.as_user(v_warehouse_id);
  select public.create_transfer(
    v_location_a,
    v_location_b,
    jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 8)),
    'PARTIAL RECEIVE TEST'
  ) into v_transfer;

  perform public.as_user(v_master_id);
  select public.transition_transfer(v_transfer.id, 'REQUESTED', 'approve') into v_transfer;
  select public.transition_transfer(v_transfer.id, 'APPROVED', 'approve') into v_transfer;
  select public.transition_transfer(v_transfer.id, 'SHIPPED', 'ship') into v_transfer;

  begin
    perform public.as_user((select id from public.profiles where role = 'LIVE' and location_id = v_location_b limit 1));
    perform public.receive_transfer(
      v_transfer.id,
      jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product_id,
          'received_quantity', 5,
          'discrepancy_reason', null
        )
      ),
      null
    );
    raise exception 'PARTIAL_RECEIVE_TEST_SHOULD_HAVE_FAILED';
  exception when others then
    v_err := sqlerrm;
    raise notice 'PARTIAL_RECEIVE_EXPECTED_FAILURE: %', v_err;
  end;
end $$;

-- 10) Final integrity checks.
select 'negative_stock' as check_name, count(*) as violations
from public.stocks
where quantity < 0 or reserved_quantity < 0 or reserved_quantity > quantity;

select 'negative_transit' as check_name, count(*) as violations
from public.transit_stocks
where quantity <= 0;

select 'invalid_transfer_quantities' as check_name, count(*) as violations
from public.stock_transfer_items
where shipped_quantity <= 0
   or received_quantity < 0
   or received_quantity > shipped_quantity;

select 'orphan_transfer_items' as check_name, count(*) as violations
from public.stock_transfer_items i
left join public.stock_transfers t on t.id = i.transfer_id
where t.id is null;

select 'orphan_transaction_items' as check_name, count(*) as violations
from public.transaction_items i
left join public.transactions t on t.id = i.transaction_id
where t.id is null;

select 'duplicate_idempotency_keys' as check_name, count(*) as violations
from (
  select idempotency_key
  from public.transactions
  where idempotency_key is not null
  group by idempotency_key
  having count(*) > 1
) d;

select 'partial_receiving_without_reason' as check_name, count(*) as violations
from public.stock_transfer_items
where received_quantity is not null
  and received_quantity < shipped_quantity
  and coalesce(trim(discrepancy_reason), '') = '';

-- 11) Useful audit report.
select
  action,
  count(*) as rows
from public.audit_logs
where created_at >= now() - interval '7 days'
group by action
order by rows desc;

select
  s.product_id,
  p.sku,
  p.name,
  s.location_id,
  s.quantity,
  s.updated_at
from public.stocks s
join public.products p on p.id = s.product_id
order by s.quantity asc, p.name
limit 50;

select public.reset_user_context();

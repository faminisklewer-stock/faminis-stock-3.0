-- Prompt 17 operational checks.
-- Run only against an isolated staging project with test users and test data.
-- This file does not create or mutate business data.

-- Structural prerequisites for the operational scenarios.
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

-- Security posture: all operational tables must have RLS enabled.
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

-- No negative stock or transit is acceptable after every scenario.
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
  select idempotency_key from public.transactions
  group by idempotency_key having count(*) > 1
) duplicates;

select 'partial_receiving_without_reason' as check_name, count(*) as violations
from public.stock_transfer_items
where received_quantity is not null
  and received_quantity < shipped_quantity
  and coalesce(trim(discrepancy_reason), '') = '';

-- Run the following authenticated API scenarios manually in staging:
-- 1. MASTER/OWNER/WAREHOUSE/LIVE/RUKO login and logout.
-- 2. RUKO-3 reads only its own location; cross-location read must be denied.
-- 3. Purchase, sale, adjustment, and transfer RPCs with expected audit rows.
-- 4. Transfer state machine: DRAFT -> REQUESTED -> APPROVED -> SHIPPED
--    -> RECEIVED -> COMPLETED, plus rejected/cancelled and invalid transitions.
-- 5. Partial receiving requires a non-empty note and persists discrepancy_reason.
-- 6. Two concurrent sales against stock=5 with quantity=4: one must fail.
-- 7. Repeat the same sale idempotency key: exactly one transaction must exist.
-- 8. Disable a test user and verify the old session cannot perform new RPC calls.
-- 9. Disconnect the browser during a critical RPC and verify no false success UI.

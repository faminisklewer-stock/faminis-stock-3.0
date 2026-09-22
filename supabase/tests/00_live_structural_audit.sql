-- Run in the Supabase SQL Editor for a structural audit of the live project.
-- This checks schema/RLS/grants only. It does not impersonate application users.

select 'tables' as check_group, count(*) as found
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'locations', 'categories', 'products', 'stocks', 'transactions', 'transaction_items', 'payments', 'purchase_receipts', 'purchase_receipt_items', 'stock_movements', 'stock_adjustments', 'stock_transfers', 'stock_transfer_items', 'stock_transfer_events', 'transit_stocks', 'audit_logs', 'settings');

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'locations', 'categories', 'products', 'stocks', 'transactions', 'transaction_items', 'payments', 'purchase_receipts', 'purchase_receipt_items', 'stock_movements', 'stock_adjustments', 'stock_transfers', 'stock_transfer_items', 'stock_transfer_events', 'transit_stocks', 'audit_logs', 'settings')
order by c.relname;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select routine_name, routine_type, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('record_sale', 'record_purchase', 'adjust_stock', 'create_transfer', 'transition_transfer', 'can_access_location', 'is_manager', 'current_user_role')
order by routine_name;

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('record_sale', 'record_purchase', 'adjust_stock', 'create_transfer', 'transition_transfer', 'can_access_location', 'is_manager', 'current_user_role')
order by routine_name, grantee;

select conrelid::regclass as table_name, conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in ('public.stocks', 'public.transactions', 'public.transaction_items', 'public.stock_transfer_items', 'public.transit_stocks')
order by table_name, constraint_name;

-- Expected unauthenticated behavior when run through the anon API, not SQL Editor:
-- record_sale       -> UNAUTHENTICATED or PERMISSION_DENIED
-- record_purchase   -> UNAUTHENTICATED or PERMISSION_DENIED
-- adjust_stock      -> UNAUTHENTICATED or PERMISSION_DENIED
-- create_transfer   -> UNAUTHENTICATED or PERMISSION_DENIED
-- transition_transfer -> UNAUTHENTICATED or PERMISSION_DENIED

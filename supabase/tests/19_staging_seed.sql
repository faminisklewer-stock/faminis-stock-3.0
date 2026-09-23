-- ============================================================
-- Seed data for staging validation
-- Run ONLY in isolated staging / QA Supabase project.
-- This script creates the minimum fixture set required to run the
-- operational scenarios without manual setup.
-- ============================================================

create or replace function public.seed_staging_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_master_id uuid := '11111111-1111-4111-8111-111111111111';
  v_owner_id uuid := '22222222-2222-4222-8222-222222222222';
  v_warehouse_id uuid := '33333333-3333-4333-8333-333333333333';
  v_live_id uuid := '44444444-4444-4444-8444-444444444444';
  v_ruko1_id uuid := '55555555-5555-4555-8555-555555555555';
  v_ruko2_id uuid := '66666666-6666-4666-8666-666666666666';
  v_ruko3_id uuid := '77777777-7777-4777-8777-777777777777';
  v_ruko4_id uuid := '88888888-8888-4888-8888-888888888888';

  v_wh_a_id uuid;
  v_wh_b_id uuid;
  v_store_id uuid;
  v_product_1_id uuid;
  v_product_2_id uuid;
  v_product_3_id uuid;
  v_product_4_id uuid;
  v_product_5_id uuid;
  v_existing uuid;
begin
  -- 1) Locations
  insert into public.locations(id, code, name, kind, active, created_at)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'WH-A', 'Warehouse A', 'WAREHOUSE', true, now()),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'WH-B', 'Warehouse B', 'WAREHOUSE', true, now()),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'STORE-01', 'Store 01', 'STORE', true, now())
  on conflict (id) do nothing;

  select id into v_wh_a_id from public.locations where code = 'WH-A';
  select id into v_wh_b_id from public.locations where code = 'WH-B';
  select id into v_store_id from public.locations where code = 'STORE-01';

  -- 2) Auth users (required for login and profile ownership)
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    last_sign_in_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_token_valid_after,
    phone_change_token_valid_after,
    email_change_token_valid_after,
    email_change_token_current,
    email_change_token_current_valid_after,
    banned_until,
    reauthentication_token,
    reauthentication_expires_at,
    deleted_at
  )
  values
    (v_master_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'master@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Master User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_warehouse_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'warehouse@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Warehouse User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_live_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'live@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Live User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_ruko1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ruko1@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ruko 1 User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_ruko2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ruko2@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ruko 2 User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_ruko3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ruko3@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ruko 3 User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null),
    (v_ruko4_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ruko4@staging.local', 'staging-seed', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ruko 4 User"}', false, '', '', '', '', null, null, null, '', null, null, null, '', null, null, null, null, null)
  on conflict (id) do nothing;

  -- 3) Profiles
  insert into public.profiles(id, full_name, role, location_id, active, created_at, updated_at)
  values
    (v_master_id, 'Master User', 'MASTER', null, true, now(), now()),
    (v_owner_id, 'Owner User', 'OWNER', null, true, now(), now()),
    (v_warehouse_id, 'Warehouse User', 'WAREHOUSE', v_wh_a_id, true, now(), now()),
    (v_live_id, 'Live User', 'LIVE', v_store_id, true, now(), now()),
    (v_ruko1_id, 'Ruko 1 User', 'RUKO', v_wh_a_id, true, now(), now()),
    (v_ruko2_id, 'Ruko 2 User', 'RUKO', v_wh_b_id, true, now(), now()),
    (v_ruko3_id, 'Ruko 3 User', 'RUKO', v_wh_a_id, true, now(), now()),
    (v_ruko4_id, 'Ruko 4 User', 'RUKO', v_wh_b_id, true, now(), now())
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        location_id = excluded.location_id,
        active = excluded.active,
        updated_at = now();

  -- 4) Products
  insert into public.products(id, sku, name, category_id, variant, grade, size, motif, color, material, unit, active, created_at, updated_at)
  values
    ('11111111-1111-4111-8111-111111111111', 'GMS-001', 'Gamis Linen Basic', null, 'Basic', 'A', 'M', null, 'Olive', 'Linen', 'pcs', true, now(), now()),
    ('22222222-2222-4222-8222-222222222222', 'BLA-002', 'Blazer Formal', null, 'Formal', 'A', 'L', null, 'Black', 'Wool', 'pcs', true, now(), now()),
    ('33333333-3333-4333-8333-333333333333', 'DRE-003', 'Dress Satin', null, 'Satin', 'B', 'S', null, 'Champagne', 'Satin', 'pcs', true, now(), now()),
    ('44444444-4444-4444-8444-444444444444', 'JKT-004', 'Jaket Denim', null, 'Denim', 'A', 'XL', null, 'Blue', 'Denim', 'pcs', true, now(), now()),
    ('55555555-5555-4555-8555-555555555555', 'SKR-005', 'Skirt Pleated', null, 'Pleated', 'A', 'M', 'Floral', 'Cream', 'Cotton', 'pcs', true, now(), now())
  on conflict (sku) do update
    set name = excluded.name,
        variant = excluded.variant,
        grade = excluded.grade,
        size = excluded.size,
        color = excluded.color,
        material = excluded.material,
        unit = excluded.unit,
        active = excluded.active,
        updated_at = now();

  select id into v_product_1_id from public.products where sku = 'GMS-001';
  select id into v_product_2_id from public.products where sku = 'BLA-002';
  select id into v_product_3_id from public.products where sku = 'DRE-003';
  select id into v_product_4_id from public.products where sku = 'JKT-004';
  select id into v_product_5_id from public.products where sku = 'SKR-005';

  -- 5) Stocks for locations
  insert into public.stocks(product_id, location_id, quantity, reserved_quantity, updated_at)
  values
    (v_product_1_id, v_wh_a_id, 30, 0, now()),
    (v_product_1_id, v_wh_b_id, 18, 0, now()),
    (v_product_1_id, v_store_id, 12, 0, now()),
    (v_product_2_id, v_wh_a_id, 25, 0, now()),
    (v_product_2_id, v_wh_b_id, 14, 0, now()),
    (v_product_2_id, v_store_id, 10, 0, now()),
    (v_product_3_id, v_wh_a_id, 20, 0, now()),
    (v_product_3_id, v_wh_b_id, 16, 0, now()),
    (v_product_3_id, v_store_id, 8, 0, now()),
    (v_product_4_id, v_wh_a_id, 12, 0, now()),
    (v_product_4_id, v_wh_b_id, 9, 0, now()),
    (v_product_4_id, v_store_id, 7, 0, now()),
    (v_product_5_id, v_wh_a_id, 18, 0, now()),
    (v_product_5_id, v_wh_b_id, 13, 0, now()),
    (v_product_5_id, v_store_id, 9, 0, now())
  on conflict (product_id, location_id) do update
    set quantity = excluded.quantity,
        reserved_quantity = excluded.reserved_quantity,
        updated_at = now();

  -- 6) Seed sample transfer and audit rows (optional but useful)
  insert into public.stock_transfers(id, source_location_id, destination_location_id, status, notes, requested_by, approved_by, shipped_at, received_at, created_at)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', v_wh_a_id, v_wh_b_id, 'COMPLETED', 'Seeded sample transfer', v_warehouse_id, v_master_id, now(), now(), now())
  on conflict (id) do nothing;

  insert into public.stock_transfer_items(id, transfer_id, product_id, shipped_quantity, received_quantity, discrepancy_reason)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', v_product_1_id, 6, 6, null)
  on conflict (id) do nothing;

  insert into public.audit_logs(id, user_id, role, location_id, action, reference_type, reference_id, description, created_at)
  values
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', v_master_id, 'MASTER', v_wh_a_id, 'SEED', 'SYSTEM', null, 'Staging seed data initialized', now())
  on conflict (id) do nothing;

  raise notice 'STAGING_SEED_OK: users=% locations=% products=% stocks=%',
    (select count(*) from public.profiles),
    (select count(*) from public.locations),
    (select count(*) from public.products),
    (select count(*) from public.stocks);
end $$;

select public.seed_staging_data();

select
  p.role,
  p.full_name,
  p.location_id,
  l.name as location_name,
  p.active
from public.profiles p
left join public.locations l on l.id = p.location_id
order by p.role, p.full_name;

select
  p.sku,
  p.name,
  s.location_id,
  l.name as location_name,
  s.quantity
from public.stocks s
join public.products p on p.id = s.product_id
join public.locations l on l.id = s.location_id
order by p.name, l.name;

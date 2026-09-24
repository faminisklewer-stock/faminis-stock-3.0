-- Safe rerunnable product master seed.
-- This script avoids duplicate product/category rows by using UPSERT rules.
-- It is safe to run repeatedly without creating duplicate records.

with category_seed as (
  select * from (values
    ('Mukena'),
    ('Sarung'),
    ('Sajadah'),
    ('Daster'),
    ('Busana Wanita'),
    ('Busana Pria')
  ) as v(name)
)
insert into public.categories (name, active, created_at)
select distinct trim(name), true, now()
from category_seed
where trim(name) <> ''
on conflict (name) do update
set active = true;

with product_seed as (
  select * from (values
    ('MKN-PRM', 'Mukena Premium', 'Mukena'),
    ('MKN-JMB', 'Mukena Jumbo', 'Mukena'),
    ('SRG-RBD', 'Sarung Rayon Batik Dewasa', 'Sarung'),
    ('SJD-MRB', 'Sajadah Muka Rumbai', 'Sajadah'),
    ('DST-BSA', 'Daster Biasa', 'Daster'),
    ('BSW-LDR', 'Long Dres', 'Busana Wanita'),
    ('BSP-KBG', 'Baju Koko Bugel', 'Busana Pria')
  ) as v(sku, name, category_name)
)
insert into public.products (sku, name, category_id, unit, active, created_at, updated_at)
select s.sku,
       s.name,
       c.id,
       'pcs',
       true,
       now(),
       now()
from product_seed s
left join public.categories c
  on lower(trim(c.name)) = lower(trim(s.category_name))
where trim(s.sku) <> ''
on conflict (sku) do update
set name = excluded.name,
    category_id = excluded.category_id,
    unit = excluded.unit,
    active = true,
    updated_at = now();

insert into public.stocks (product_id, location_id, quantity, updated_at)
select p.id, l.id, 0, now()
from public.products p
cross join public.locations l
where p.active = true
on conflict (product_id, location_id) do update
set quantity = 0,
    updated_at = now();

-- Development/demo catalog. Safe to run more than once.
insert into public.products (sku, name, category_id, variant, size, color, material, unit)
select product.sku, product.name, c.id, product.variant, product.size, product.color, product.material, 'pcs'
from (values
  ('DAS-001', 'Daster Rayon Polos', 'Daster', 'Panjang', 'All Size', 'Coklat', 'Rayon'),
  ('MKN-001', 'Mukena Travel Rayon', 'Mukena', 'Travel', 'All Size', 'Cream', 'Rayon'),
  ('SRG-001', 'Sarung Premium', 'Sarung', 'Tenun', 'All Size', 'Maroon', 'Katun'),
  ('GMS-001', 'Gamis Linen Basic', 'Gamis', 'Basic', 'M-L', 'Olive', 'Linen'),
  ('SET-001', 'Setelan Katun Anak', 'Setelan', 'Anak', 'S', 'Dusty Pink', 'Katun')
) as product(sku, name, category, variant, size, color, material)
join public.categories c on c.name = product.category
on conflict (sku) do nothing;

insert into public.stocks (product_id, location_id, quantity)
select p.id, l.id, 20
from public.products p
cross join public.locations l
where p.sku in ('DAS-001', 'MKN-001', 'SRG-001', 'GMS-001', 'SET-001')
  and l.code = 'gudang'
on conflict (product_id, location_id) do nothing;

insert into public.locations (code, name, kind) values
  ('gudang', 'Gudang', 'WAREHOUSE'),
  ('live', 'Live', 'LIVE'),
  ('ruko_1', 'Ruko 1', 'STORE'),
  ('ruko_2', 'Ruko 2', 'STORE'),
  ('ruko_3', 'Ruko 3', 'STORE'),
  ('ruko_4', 'Ruko 4', 'STORE')
on conflict (code) do nothing;

insert into public.categories (name, active, created_at)
select distinct src.name, true, now()
from (
  values
    ('Mukena'),
    ('Sarung'),
    ('Sajadah'),
    ('Daster'),
    ('Busana Wanita'),
    ('Busana Pria')
) as src(name)
where trim(src.name) <> ''
on conflict (name) do update
set active = true;

with seed_products as (
  select * from (values
    ('MKN-PRM', 'Mukena Premium', 'Mukena'),
    ('MKN-JMB', 'Mukena Jumbo', 'Mukena'),
    ('MKN-PRY', 'Mukena Polos Rayon', 'Mukena'),
    ('MKN-STD', 'Mukena Standart', 'Mukena'),
    ('MKN-ARD', 'Mukena Armani Dewasa', 'Mukena'),
    ('MKN-ARB', 'Mukena Armani Renda Besar', 'Mukena'),
    ('MKN-ARA', 'Mukena Armani Anak', 'Mukena'),
    ('MKN-ART', 'Mukena Armani Terusan', 'Mukena'),
    ('MKN-JGR', 'Mukena Jaguar Renda', 'Mukena'),
    ('MKN-TVPM', 'Mukena Travel Putusan Motif', 'Mukena'),
    ('MKN-TVTM', 'Mukena Travel Terusan Motif', 'Mukena'),
    ('MKN-TVPP', 'Mukena Travel Putusan Polos', 'Mukena'),
    ('MKN-TVTP', 'Mukena Travel Terusan Polos', 'Mukena'),
    ('MKN-TVPA', 'Mukena Travel Putusan Anak', 'Mukena'),
    ('MKN-TSM', 'Mukena Terusan Motif', 'Mukena'),
    ('MKN-TSP', 'Mukena Terusan Polos', 'Mukena'),
    ('MKN-TSPR', 'Mukena Terusan Premium', 'Mukena'),
    ('MKN-VSC', 'Mukena Viscose', 'Mukena'),
    ('MKN-MXM', 'Mukena Maxmara', 'Mukena'),
    ('MKN-SNT', 'Mukena Santorini', 'Mukena'),
    ('MKN-KDJ', 'Mukena Khodijah', 'Mukena'),
    ('MKN-CRK', 'Mukena Crinkel', 'Mukena'),
    ('MKN-BKJ', 'Mukena Bordir/Katun Jepang', 'Mukena'),
    ('MKN-BPG', 'Mukena Bordir Punggung', 'Mukena'),
    ('MKN-KMM', 'Mukena Katun Micro Motif', 'Mukena'),
    ('MKN-KMP', 'Mukena Katun Micro Polos', 'Mukena'),
    ('MKN-KPR', 'Mukena Katun Paris', 'Mukena'),
    ('MKN-KVL', 'Mukena Katun Voil', 'Mukena'),
    ('MKN-TGR', 'Mukena Tanggung Anak Rayon (motif)', 'Mukena'),
    ('MKN-TGS', 'Mukena Tanggung Anak Sajadah (polos)', 'Mukena'),
    ('MKN-TGP', 'Mukena Tanggung Anak Premium', 'Mukena'),
    ('MKN-TGT', 'Mukena Tanggung Anak Terusan', 'Mukena'),
    ('MKN-RND', 'Mukena Rendi', 'Mukena'),
    ('MKN-RNB', 'Mukena Renda Besar', 'Mukena'),
    ('MKN-STR', 'Mukena Sutera (Doa Ibu)', 'Mukena'),
    ('MKN-HDR', 'Mukena Hadromut', 'Mukena'),
    ('MKN-BTC', 'Mukena Batik Cap', 'Mukena'),
    ('SRG-RBD', 'Sarung Rayon Batik Dewasa', 'Sarung'),
    ('SRG-PLM', 'Sarung Polymikro', 'Sarung'),
    ('SRG-KCW', 'Sarung Katun Cap Wajada', 'Sarung'),
    ('SRG-GJD', 'Sarung Gajah Duduk/Asia', 'Sarung'),
    ('SRG-WDM', 'Sarung Wadimor', 'Sarung'),
    ('SRG-BLL', 'Sarung Bilal', 'Sarung'),
    ('SRG-AZK', 'Sarung Anak Azka', 'Sarung'),
    ('SRG-GYR', 'Sarung Goyor', 'Sarung'),
    ('SJD-MRB', 'Sajadah Muka Rumbai', 'Sajadah'),
    ('SJD-TBT', 'Sajadah Tambang Tanggung', 'Sajadah'),
    ('SJD-TBB', 'Sajadah Tambang Besar', 'Sajadah'),
    ('SJD-MKA', 'Sajadah Muka Akbar', 'Sajadah'),
    ('SJD-AKB', 'Sajadah Akbar Besar', 'Sajadah'),
    ('SJD-EMB', 'Sajadah Embos', 'Sajadah'),
    ('SJD-TRV', 'Sajadah Travel', 'Sajadah'),
    ('SJD-SUD', 'Sajadah Suede', 'Sajadah'),
    ('SJD-ALD', 'Sajadah Alaydrus', 'Sajadah'),
    ('SJD-ALM', 'Sajadah Alifmidi', 'Sajadah'),
    ('SJD-BTK', 'Sajadah Batik', 'Sajadah'),
    ('SJD-JML', 'Sajadah Jamal', 'Sajadah'),
    ('DST-BSA', 'Daster Biasa', 'Daster'),
    ('DST-PRM', 'Daster Premium', 'Daster'),
    ('DST-JPR', 'Daster Jumbo Premium', 'Daster'),
    ('DST-JBS', 'Daster Jumbo Biasa', 'Daster'),
    ('DST-KLL', 'Daster Kelelawar', 'Daster'),
    ('DST-CHB', 'Daster Chibi', 'Daster'),
    ('DST-CAP', 'Daster Cap', 'Daster'),
    ('BSW-LDR', 'Long Dres', 'Busana Wanita'),
    ('BSW-LDB', 'Long Dres Biru', 'Busana Wanita'),
    ('BSW-KFB', 'Kaftan Biasa', 'Busana Wanita'),
    ('BSW-KFP', 'Kaftan Premium', 'Busana Wanita'),
    ('BSW-STJ', 'Setelan Jumbo', 'Busana Wanita'),
    ('BSW-CLN', 'Celana', 'Busana Wanita'),
    ('BSP-KBG', 'Baju Koko Bugel', 'Busana Pria'),
    ('BSP-KAR', 'Baju Koko AR', 'Busana Pria'),
    ('BSP-KTR', 'Baju Koko Trompah', 'Busana Pria'),
    ('BSP-KPT', 'Baju Koko Putih', 'Busana Pria'),
    ('BSP-GLK', 'Gamis Laki Laki', 'Busana Pria')
  ) as seed(sku, name, category_name)
  where trim(seed.sku) <> ''
)
insert into public.products (sku, name, category_id, unit, active, created_at, updated_at)
select s.sku,
       s.name,
       c.id,
       'pcs',
       true,
       now(),
       now()
from seed_products s
left join public.categories c
  on lower(trim(c.name)) = lower(trim(s.category_name))
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

insert into public.settings (key, value) values
  ('low_stock_threshold', '{"value": 5}'),
  ('company', '{"name": "Faminis Barokah"}')
on conflict (key) do update set value = excluded.value;

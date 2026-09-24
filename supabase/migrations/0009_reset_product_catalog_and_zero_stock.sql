begin;

-- Clear product-related operational data so the catalog can be rebuilt from scratch.
delete from public.stock_movements where product_id in (select id from public.products);
delete from public.stock_adjustments where product_id in (select id from public.products);
delete from public.transit_stocks where product_id in (select id from public.products);
delete from public.stock_transfer_events where transfer_id in (select id from public.stock_transfers);
delete from public.stock_transfer_items where product_id in (select id from public.products);
delete from public.stock_transfers where true;
delete from public.purchase_receipt_items where product_id in (select id from public.products);
delete from public.purchase_receipts where id in (select receipt_id from public.purchase_receipt_items);
delete from public.transaction_items where product_id in (select id from public.products);
delete from public.payments where transaction_id in (select id from public.transactions);
delete from public.transactions where id in (select transaction_id from public.transaction_items);
delete from public.stocks where product_id in (select id from public.products);
delete from public.products where true;

-- Rebuild catalog with the requested names and zero stock as the starting point.
insert into public.products (sku, name, unit, active, created_at, updated_at)
values
  ('MUKENA-PREMIUM', 'Mukena Premium', 'pcs', true, now(), now()),
  ('MUKENA-JUMBO', 'Mukena Jumbo', 'pcs', true, now(), now()),
  ('MUKENA-POLOS-RAYON', 'Mukena Polos Rayon', 'pcs', true, now(), now()),
  ('MUKENA-STANDART', 'Mukena Standart', 'pcs', true, now(), now()),
  ('MUKENA-ARMANI-DEWASA', 'Mukena Armani Dewasa', 'pcs', true, now(), now()),
  ('MUKENA-ARMANI-RENDA-BESAR', 'Mukena Armani Renda Besar', 'pcs', true, now(), now()),
  ('MUKENA-ARMANI-ANAK', 'Mukena Armani Anak', 'pcs', true, now(), now()),
  ('MUKENA-JAGUAR-RENDA', 'Mukena Jaguar Renda', 'pcs', true, now(), now()),
  ('MUKENA-TRAVEL-PUTUSAN-MOTIF', 'Mukena Travel Putusan Motif', 'pcs', true, now(), now()),
  ('MUKENA-TRAVEL-TERUSAN-MOTIF', 'Mukena Travel Terusan Motif', 'pcs', true, now(), now()),
  ('MUKENA-TRAVEL-PUTUSAN-POLOS', 'Mukena Travel Putusan Polos', 'pcs', true, now(), now()),
  ('MUKENA-TRAVEL-TERUSAN-POLOS', 'Mukena Travel Terusan Polos', 'pcs', true, now(), now()),
  ('MUKENA-TRAVEL-PUTUSAN-ANAK', 'Mukena Travel Putusan Anak', 'pcs', true, now(), now()),
  ('MUKENA-TERUSAN-MOTIF', 'Mukena Terusan Motif', 'pcs', true, now(), now()),
  ('MUKENA-TERUSAN-POLOS', 'Mukena Terusan Polos', 'pcs', true, now(), now()),
  ('MUKENA-TERUSAN-PREMIUM', 'Mukena Terusan Premium', 'pcs', true, now(), now()),
  ('MUKENA-VISCOSE', 'Mukena Viscose', 'pcs', true, now(), now()),
  ('MUKENA-MAXMARA', 'Mukena Maxmara', 'pcs', true, now(), now()),
  ('MUKENA-SANTORINI', 'Mukena Santorini', 'pcs', true, now(), now()),
  ('MUKENA-KHODIJAH', 'Mukena Khodijah', 'pcs', true, now(), now()),
  ('MUKENA-CRINKEL', 'Mukena Crinkel', 'pcs', true, now(), now()),
  ('MUKENA-BORDIR-KATUN-JEPANG', 'Mukena Bordir/Katun Jepang', 'pcs', true, now(), now()),
  ('MUKENA-BORDIR-PUNGGUNG', 'Mukena Bordir Punggung', 'pcs', true, now(), now()),
  ('MUKENA-KATUN-MICRO-MOTIF', 'Mukena Katun Micro Motif', 'pcs', true, now(), now()),
  ('MUKENA-KATUN-MICRO-POLOS', 'Mukena Katun Micro Polos', 'pcs', true, now(), now()),
  ('MUKENA-KATUN-PARIS', 'Mukena Katun Paris', 'pcs', true, now(), now()),
  ('MUKENA-KATUN-VOIL', 'Mukena Katun Voil', 'pcs', true, now(), now()),
  ('MUKENA-TANGGUNG-ANAK-RAYON', 'Mukena Tanggung Anak Rayon (motif)', 'pcs', true, now(), now()),
  ('MUKENA-TANGGUNG-ANAK-SAJADAH', 'Mukena Tanggung Anak Sajadah (polos)', 'pcs', true, now(), now()),
  ('MUKENA-TANGGUNG-ANAK-PREMIUM', 'Mukena Tanggung Anak Premium', 'pcs', true, now(), now()),
  ('MUKENA-TANGGUNG-ANAK-TERUSAN', 'Mukena Tanggung Anak Terusan', 'pcs', true, now(), now()),
  ('MUKENA-RENDI', 'Mukena Rendi', 'pcs', true, now(), now()),
  ('MUKENA-RENDA-BESAR', 'Mukena Renda Besar', 'pcs', true, now(), now()),
  ('MUKENA-SUTERA', 'Mukena Sutera (Doa Ibu)', 'pcs', true, now(), now()),
  ('MUKENA-HADROMUT', 'Mukena Hadromut', 'pcs', true, now(), now()),
  ('MUKENA-ARMANI-TERUSAN', 'Mukena Armani Terusan', 'pcs', true, now(), now()),
  ('MUKENA-BATIK-CAP', 'Mukena Batik Cap', 'pcs', true, now(), now()),
  ('SARUNG-RAYON-BATIK-DEWASA', 'Sarung Rayon Batik Dewasa', 'pcs', true, now(), now()),
  ('SARUNG-POLYMIKRO', 'Sarung Polymikro', 'pcs', true, now(), now()),
  ('SARUNG-KATUN-CAP-WAJADA', 'Sarung Katun Cap Wajada', 'pcs', true, now(), now()),
  ('SARUNG-GAJAH-DUDUK', 'Sarung Gajah Duduk/Asia', 'pcs', true, now(), now()),
  ('SARUNG-WADIMOR', 'Sarung Wadimor', 'pcs', true, now(), now()),
  ('SARUNG-BILAL', 'Sarung Bilal', 'pcs', true, now(), now()),
  ('SARUNG-ANAK-AZKA', 'Sarung Anak Azka', 'pcs', true, now(), now()),
  ('SARUNG-GOYOR', 'Sarung Goyor', 'pcs', true, now(), now()),
  ('SAJADAH-MUKA-RUMBI', 'Sajadah Muka Rumbai', 'pcs', true, now(), now()),
  ('SAJADAH-TAMBANG-TANGGUNG', 'Sajadah Tambang Tanggung', 'pcs', true, now(), now()),
  ('SAJADAH-TAMBANG-BESAR', 'Sajadah Tambang Besar', 'pcs', true, now(), now()),
  ('SAJADAH-MUKA-AKBAR', 'Sajadah Muka Akbar', 'pcs', true, now(), now()),
  ('SAJADAH-AKBAR-BESAR', 'Sajadah Akbar Besar', 'pcs', true, now(), now()),
  ('SAJADAH-EMBOS', 'Sajadah Embos', 'pcs', true, now(), now()),
  ('SAJADAH-TRAVEL', 'Sajadah Travel', 'pcs', true, now(), now()),
  ('SAJADAH-SUEDE', 'Sajadah Suede', 'pcs', true, now(), now()),
  ('SAJADAH-ALAYDRUS', 'Sajadah Alaydrus', 'pcs', true, now(), now()),
  ('SAJADAH-ALIFMIDI', 'Sajadah Alifmidi', 'pcs', true, now(), now()),
  ('SAJADAH-BATIK', 'Sajadah Batik', 'pcs', true, now(), now()),
  ('SAJADAH-JAMAL', 'Sajadah Jamal', 'pcs', true, now(), now()),
  ('DASTER-BIASA', 'Daster Biasa', 'pcs', true, now(), now()),
  ('DASTER-PREMIUM', 'Daster Premium', 'pcs', true, now(), now()),
  ('DASTER-JUMBO-PREMIUM', 'Daster Jumbo Premium', 'pcs', true, now(), now()),
  ('DASTER-JUMBO-BIASA', 'Daster Jumbo Biasa', 'pcs', true, now(), now()),
  ('DASTER-KELELAWAR', 'Daster Kelelawar', 'pcs', true, now(), now()),
  ('DASTER-CHIBI', 'Daster Chibi', 'pcs', true, now(), now()),
  ('DASTER-CAP', 'Daster Cap', 'pcs', true, now(), now()),
  ('LONG-DRES', 'Long Dres', 'pcs', true, now(), now()),
  ('LONG-DRES-BIRU', 'Long Dres Biru', 'pcs', true, now(), now()),
  ('KAFTAN-BIASA', 'Kaftan Biasa', 'pcs', true, now(), now()),
  ('KAFTAN-PREMIUM', 'Kaftan Premium', 'pcs', true, now(), now()),
  ('SETELAN-JUMBO', 'Setelan Jumbo', 'pcs', true, now(), now()),
  ('CELANA', 'Celana', 'pcs', true, now(), now()),
  ('BAJU-KOKO-BUGEL', 'Baju Koko Bugel', 'pcs', true, now(), now()),
  ('BAJU-KOKO-AR', 'Baju Koko AR', 'pcs', true, now(), now()),
  ('BAJU-KOKO-TROMPAH', 'Baju Koko Trompah', 'pcs', true, now(), now()),
  ('BAJU-KOKO-PUTIH', 'Baju Koko Putih', 'pcs', true, now(), now()),
  ('GAMIS-LAKI-LAKI', 'Gamis Laki Laki', 'pcs', true, now(), now())
on conflict (sku) do update
set name = excluded.name,
    unit = excluded.unit,
    active = true,
    updated_at = now();

insert into public.stocks (product_id, location_id, quantity, updated_at)
select p.id, l.id, 0, now()
from public.products p
cross join public.locations l
where p.active = true
on conflict (product_id, location_id) do update
set quantity = excluded.quantity,
    updated_at = now();

commit;

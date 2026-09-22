insert into public.locations (code, name, kind) values
  ('gudang', 'Gudang', 'WAREHOUSE'),
  ('live', 'Live', 'LIVE'),
  ('ruko_1', 'Ruko 1', 'STORE'),
  ('ruko_2', 'Ruko 2', 'STORE'),
  ('ruko_3', 'Ruko 3', 'STORE'),
  ('ruko_4', 'Ruko 4', 'STORE')
on conflict (code) do nothing;

insert into public.categories (name) values
  ('Daster'), ('Mukena'), ('Sarung'), ('Gamis'), ('Setelan'), ('Sajadah'), ('Baju Koko')
on conflict (name) do nothing;

insert into public.settings (key, value) values
  ('low_stock_threshold', '{"value": 5}'),
  ('company', '{"name": "Faminis Barokah"}')
on conflict (key) do update set value = excluded.value;

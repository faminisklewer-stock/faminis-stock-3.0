-- Private product image storage. Run after enabling Supabase Storage.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do update set public = false;

drop policy if exists "authenticated read product images" on storage.objects;
drop policy if exists "master upload product images" on storage.objects;
drop policy if exists "master update product images" on storage.objects;
drop policy if exists "master delete product images" on storage.objects;

create policy "authenticated read product images"
on storage.objects for select to authenticated
using (bucket_id = 'product-images');

create policy "master upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.current_user_role() = 'MASTER');

create policy "master update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.current_user_role() = 'MASTER')
with check (bucket_id = 'product-images' and public.current_user_role() = 'MASTER');

create policy "master delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.current_user_role() = 'MASTER');

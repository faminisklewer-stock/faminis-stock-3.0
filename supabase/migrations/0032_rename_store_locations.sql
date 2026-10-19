create or replace function public.rename_store_location(
  p_location_id uuid,
  p_name text
) returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.app_role;
  location_row public.locations;
  old_name text;
  normalized_name text;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor is distinct from 'MASTER' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_location_id is null then
    raise exception 'INVALID_LOCATION';
  end if;

  normalized_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if normalized_name = '' or char_length(normalized_name) > 100 then
    raise exception 'INVALID_LOCATION_NAME';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.locations.name'), 1);

  select * into location_row
  from public.locations
  where id = p_location_id
  for update;
  if location_row.id is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;
  if location_row.kind is distinct from 'STORE' then
    raise exception 'NOT_A_STORE_LOCATION';
  end if;
  if exists (
    select 1 from public.locations other_location
    where other_location.id <> location_row.id
      and lower(btrim(other_location.name)) = lower(normalized_name)
  ) then
    raise exception 'DUPLICATE_LOCATION_NAME';
  end if;

  if location_row.name = normalized_name then
    return location_row;
  end if;

  old_name := location_row.name;
  update public.locations
  set name = normalized_name
  where id = location_row.id
  returning * into location_row;

  insert into public.audit_logs(
    user_id, role, location_id, action, reference_type, reference_id, description, metadata
  )
  values (
    auth.uid(),
    actor,
    location_row.id,
    'LOCATION_RENAME',
    'LOCATION',
    location_row.id,
    'Nama lokasi diperbarui',
    jsonb_build_object('old_name', old_name, 'new_name', normalized_name)
  );

  return location_row;
end;
$$;

revoke all on function public.rename_store_location(uuid, text) from public, anon;
grant execute on function public.rename_store_location(uuid, text) to authenticated;

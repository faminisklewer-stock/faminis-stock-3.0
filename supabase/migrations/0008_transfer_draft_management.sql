create or replace function public.update_transfer_draft(
  p_transfer_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer public.stock_transfers;
  normalized_note text;
begin
  select * into transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if transfer.id is null then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;

  if transfer.status <> 'DRAFT' then
    raise exception 'TRANSFER_NOT_EDITABLE';
  end if;

  if not public.can_access_location(transfer.source_location_id) or not public.can_access_location(transfer.destination_location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_product_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_TRANSFER_ITEM';
  end if;

  normalized_note := nullif(trim(coalesce(p_notes, '')), '');

  if exists (select 1 from public.stock_transfer_items where transfer_id = p_transfer_id) then
    update public.stock_transfer_items
       set product_id = p_product_id,
           shipped_quantity = p_quantity
     where transfer_id = p_transfer_id;
  else
    insert into public.stock_transfer_items(transfer_id, product_id, shipped_quantity)
    values (p_transfer_id, p_product_id, p_quantity);
  end if;

  update public.stock_transfers
     set notes = normalized_note
   where id = p_transfer_id
   returning * into transfer;

  return transfer;
end $$;

revoke all on function public.update_transfer_draft(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.update_transfer_draft(uuid, uuid, integer, text) to authenticated;

create or replace function public.delete_transfer_draft(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer public.stock_transfers;
begin
  select * into transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if transfer.id is null then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;

  if transfer.status <> 'DRAFT' then
    raise exception 'TRANSFER_NOT_EDITABLE';
  end if;

  if not public.can_access_location(transfer.source_location_id) or not public.can_access_location(transfer.destination_location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.stock_transfers where id = p_transfer_id;
  return true;
end $$;

revoke all on function public.delete_transfer_draft(uuid) from public, anon, authenticated;
grant execute on function public.delete_transfer_draft(uuid) to authenticated;

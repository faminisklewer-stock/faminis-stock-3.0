create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_items jsonb,
  p_note text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer public.stock_transfers;
  item jsonb;
  item_row public.stock_transfer_items;
  received integer;
  reason text;
begin
  perform public.require_authenticated();

  select * into transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if transfer.id is null then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;

  if not (public.can_access_location(transfer.source_location_id) or public.can_access_location(transfer.destination_location_id)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if transfer.status <> 'SHIPPED' then
    raise exception 'INVALID_TRANSFER_TRANSITION';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_TRANSFER_RECEIPT';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into item_row
    from public.stock_transfer_items
    where transfer_id = p_transfer_id and product_id = (item->>'product_id')::uuid
    for update;

    if item_row.id is null then
      raise exception 'TRANSFER_ITEM_NOT_FOUND';
    end if;

    received := coalesce((item->>'received_quantity')::integer, item_row.shipped_quantity);
    if received < 0 or received > item_row.shipped_quantity then
      raise exception 'INVALID_RECEIVED_QUANTITY';
    end if;

    reason := nullif(trim(item->>'discrepancy_reason'), '');
    if received < item_row.shipped_quantity and coalesce(reason, '') = '' and coalesce(trim(p_note), '') = '' then
      raise exception 'DISCREPANCY_REASON_REQUIRED';
    end if;

    update public.stock_transfer_items
    set received_quantity = received,
        discrepancy_reason = case
          when received < item_row.shipped_quantity then coalesce(reason, p_note)
          else null
        end
    where id = item_row.id;
  end loop;

  return public.transition_transfer(p_transfer_id, 'RECEIVED', p_note);
end $$;

revoke all on function public.receive_transfer(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_transfer(uuid, jsonb, text) to authenticated;

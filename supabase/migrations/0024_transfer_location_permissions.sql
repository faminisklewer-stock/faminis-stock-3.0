create or replace function public.create_transfer(p_source_location_id uuid, p_destination_location_id uuid, p_items jsonb, p_notes text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item jsonb; actor public.app_role;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if p_source_location_id is null or p_destination_location_id is null or p_source_location_id = p_destination_location_id or not public.can_access_location(p_source_location_id) then raise exception 'PERMISSION_DENIED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID_TRANSFER_REQUEST'; end if;
  if not exists (select 1 from public.locations where id = p_destination_location_id and active) then raise exception 'INVALID_DESTINATION_LOCATION'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::integer, 0) <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if not exists (select 1 from public.products where id = (item->>'product_id')::uuid and active) then raise exception 'PRODUCT_NOT_ACTIVE'; end if;
  end loop;
  insert into public.stock_transfers(source_location_id, destination_location_id, requested_by, notes) values (p_source_location_id, p_destination_location_id, auth.uid(), p_notes) returning * into transfer;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.stock_transfer_items(transfer_id, product_id, shipped_quantity) values (transfer.id, (item->>'product_id')::uuid, (item->>'quantity')::integer);
  end loop;
  insert into public.stock_transfer_events(transfer_id, status, created_by) values (transfer.id, 'DRAFT', auth.uid());
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, p_source_location_id, 'TRANSFER_CREATED', 'STOCK_TRANSFER', transfer.id, p_notes);
  return transfer;
end $$;

create or replace function public.transition_transfer(p_transfer_id uuid, p_next_status public.transfer_status, p_note text default null)
returns public.stock_transfers language plpgsql security definer set search_path = public
as $$
declare transfer public.stock_transfers; item record; current_status public.transfer_status; actor public.app_role; received integer;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  select * into transfer from public.stock_transfers where id = p_transfer_id for update;
  if transfer.id is null or not (public.can_access_location(transfer.source_location_id) or public.can_access_location(transfer.destination_location_id)) then raise exception 'PERMISSION_DENIED'; end if;
  current_status := transfer.status;
  if current_status = 'DRAFT' and p_next_status = 'REQUESTED' and public.can_access_location(transfer.source_location_id) then null;
  elsif current_status = 'DRAFT' and p_next_status = 'CANCELLED' then null;
  elsif current_status = 'REQUESTED' and p_next_status in ('REJECTED', 'APPROVED') and public.can_access_location(transfer.destination_location_id) then null;
  elsif current_status = 'APPROVED' and p_next_status = 'SHIPPED' and public.can_access_location(transfer.source_location_id) then null;
  elsif current_status = 'APPROVED' and p_next_status = 'CANCELLED' then null;
  elsif current_status = 'SHIPPED' and p_next_status = 'RECEIVED' and public.can_access_location(transfer.destination_location_id) then null;
  elsif current_status = 'RECEIVED' and p_next_status = 'COMPLETED' and public.can_access_location(transfer.destination_location_id) then null;
  else raise exception 'INVALID_TRANSFER_TRANSITION'; end if;
  if p_next_status = 'SHIPPED' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      update public.stocks set quantity = quantity - item.shipped_quantity, updated_at = now() where product_id = item.product_id and location_id = transfer.source_location_id and quantity >= item.shipped_quantity;
      if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
      insert into public.transit_stocks(transfer_id, product_id, quantity) values (p_transfer_id, item.product_id, item.shipped_quantity);
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (item.product_id, transfer.source_location_id, 'TRANSFER_OUT', -item.shipped_quantity, 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  elsif p_next_status = 'RECEIVED' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      received := coalesce(item.received_quantity, item.shipped_quantity);
      if received < 0 or received > item.shipped_quantity then raise exception 'INVALID_RECEIVED_QUANTITY'; end if;
      if received < item.shipped_quantity and coalesce(trim(p_note), '') = '' then raise exception 'DISCREPANCY_REASON_REQUIRED'; end if;
      if not exists (select 1 from public.transit_stocks where transfer_id = p_transfer_id and product_id = item.product_id) then raise exception 'TRANSIT_STOCK_NOT_FOUND'; end if;
      delete from public.transit_stocks where transfer_id = p_transfer_id and product_id = item.product_id;
      update public.stock_transfer_items set received_quantity = received, discrepancy_reason = case when received < shipped_quantity then p_note else null end where id = item.id;
      insert into public.stocks(product_id, location_id, quantity) values (item.product_id, transfer.destination_location_id, received) on conflict (product_id, location_id) do update set quantity = stocks.quantity + excluded.quantity, updated_at = now();
      insert into public.stock_movements(product_id, location_id, movement_type, quantity, reference_type, reference_id, created_by) values (item.product_id, transfer.destination_location_id, 'TRANSFER_IN', received, 'STOCK_TRANSFER', p_transfer_id, auth.uid());
    end loop;
  end if;
  update public.stock_transfers set status = p_next_status, approved_by = case when p_next_status = 'APPROVED' then auth.uid() else approved_by end, shipped_at = case when p_next_status = 'SHIPPED' then now() else shipped_at end, received_at = case when p_next_status = 'RECEIVED' then now() else received_at end where id = p_transfer_id returning * into transfer;
  insert into public.stock_transfer_events(transfer_id, status, created_by, note) values (p_transfer_id, p_next_status, auth.uid(), p_note);
  insert into public.audit_logs(user_id, role, location_id, action, reference_type, reference_id, description) values (auth.uid(), actor, transfer.source_location_id, 'TRANSFER_' || p_next_status::text, 'STOCK_TRANSFER', p_transfer_id, p_note);
  return transfer;
end $$;

grant execute on function public.transition_transfer(uuid, public.transfer_status, text) to authenticated;

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

  if not public.can_access_location(transfer.destination_location_id) then
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
  perform public.require_authenticated();
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

  if not public.can_access_location(transfer.destination_location_id) then
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
  perform public.require_authenticated();
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

  if not public.can_access_location(transfer.destination_location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.stock_transfers where id = p_transfer_id;
  return true;
end $$;

revoke all on function public.delete_transfer_draft(uuid) from public, anon, authenticated;
grant execute on function public.delete_transfer_draft(uuid) to authenticated;
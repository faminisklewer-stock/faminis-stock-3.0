create or replace function public.edit_sale_with_date(
  p_transaction_id uuid,
  p_expected_edited_at timestamptz,
  p_items jsonb,
  p_method public.payment_method,
  p_paid_amount numeric,
  p_created_at timestamptz
) returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  sale public.transactions;
  actor public.app_role;
  old_created_at timestamptz;
begin
  perform public.require_authenticated();
  actor := public.current_user_role();
  if actor is distinct from 'MASTER' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_transaction_id is null then
    raise exception 'INVALID_TRANSACTION';
  end if;
  if p_created_at is null then
    raise exception 'INVALID_TRANSACTION_DATE';
  end if;

  select * into sale
  from public.transactions
  where id = p_transaction_id
  for update;
  if sale.id is null then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if not public.can_access_location(sale.location_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  old_created_at := sale.created_at;

  sale := public.edit_sale(
    p_transaction_id,
    p_expected_edited_at,
    p_items,
    p_method,
    p_paid_amount
  );

  if old_created_at is distinct from p_created_at then
    update public.transactions
    set created_at = p_created_at
    where id = sale.id
    returning * into sale;

    insert into public.audit_logs(
      user_id, role, location_id, action, reference_type, reference_id,
      description, metadata
    )
    values (
      auth.uid(),
      actor,
      sale.location_id,
      'SALE_DATE_EDIT',
      'TRANSACTION',
      sale.id,
      sale.invoice_no,
      jsonb_build_object(
        'before', jsonb_build_object('created_at', old_created_at),
        'after', jsonb_build_object('created_at', sale.created_at)
      )
    );
  end if;

  return sale;
end;
$$;

revoke all on function public.edit_sale_with_date(uuid, timestamptz, jsonb, public.payment_method, numeric, timestamptz) from public, anon;
grant execute on function public.edit_sale_with_date(uuid, timestamptz, jsonb, public.payment_method, numeric, timestamptz) to authenticated;

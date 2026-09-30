begin;

delete from public.transit_stocks;
delete from public.stock_transfer_events;
delete from public.stock_transfer_items;
delete from public.stock_transfers;
delete from public.purchase_receipt_items;
delete from public.purchase_receipts;
delete from public.payments;
delete from public.transaction_items;
delete from public.transactions;
delete from public.stock_adjustments;
delete from public.stock_movements;
delete from public.audit_logs;

update public.stocks
set quantity = 0,
    reserved_quantity = 0,
    updated_at = now();

commit;
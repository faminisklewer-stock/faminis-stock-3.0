# FAMINIS POS - Operational SOP

This SOP applies to staging and pilot operations. Critical actions require an active internet connection and a confirmed server response.

## SOP 01 - Login

1. Use the assigned Supabase account.
2. Confirm the displayed role and location.
3. Do not share credentials.
4. Log out after the shift.

## SOP 02 - Opening

1. Confirm the location and date.
2. Check opening stock against the approved opening-stock record.
3. Report differences before selling.
4. Do not edit the database manually.

## SOP 03 - Receive Purchase

1. Enter supplier, product, and quantity.
2. Verify the location before saving.
3. Wait for the success confirmation from the server.
4. Confirm stock movement and receipt in the report.

## SOP 04 - Retail or Wholesale Sale

1. Select the correct location.
2. Add products and verify quantity.
3. Enter the actual selling price manually.
4. Select the payment method and enter the paid amount.
5. Submit once and wait for server confirmation.
6. Keep the invoice reference for any incident.

## SOP 05 - Transfer

1. Select source and destination locations.
2. Add product quantities and verify the list.
3. Submit as DRAFT, then REQUESTED.
4. Only an authorized user may approve.
5. Warehouse ships only after APPROVED.
6. The destination counts the shipment before receiving.
7. For a shortage or damage, enter the exact reason before receiving.
8. Complete only after the receiving result is verified.

## SOP 06 - Stock Adjustment

1. Count physical stock with a second person where practical.
2. Record the system quantity, physical quantity, and reason.
3. Submit the adjustment once.
4. Keep the adjustment reference for reconciliation.

## SOP 07 - Daily Closing

1. Count transactions and payment totals.
2. Check purchases, transfers, sales, and adjustments.
3. Compare system stock with physical stock.
4. Record every difference through the approved adjustment process.
5. Escalate unresolved differences before closing the day.

## SOP 08 - Internet Interruption

1. Stop critical submissions when the connection is offline.
2. Do not report success until the server confirms it.
3. Keep the invoice or transfer details visible.
4. Reconnect and verify the server record before retrying.
5. Escalate if a retry may create a duplicate.

## SOP 09 - User Change

1. Deactivate the old user.
2. Create the replacement with the same business location and least privilege.
3. Never change historical `created_by` values.
4. Verify the replacement login and permissions.

## SOP 10 - Escalation

Escalate immediately for negative stock, duplicate transactions, unauthorized data, a transfer status jump, missing audit data, or a payment mismatch. Include user, location, time, invoice/transfer reference, screenshot, and the last successful action.

## Incident Matrix

| Incident | First response | Owner | Escalate when |
| --- | --- | --- | --- |
| Internet offline | Stop critical submit and verify connection | Shift admin | No confirmation after reconnect |
| Stock mismatch | Recount and inspect movements | Warehouse or location admin | Difference remains |
| Transfer not received | Check status and transit record | Warehouse + destination | Past agreed receiving time |
| Short or damaged goods | Record exact quantity and reason | Destination admin | Difference needs investigation |
| Wrong price or quantity | Stop and retain invoice reference | Shift admin | Transaction already confirmed |
| Login failure | Verify account and active status | Master | Profile or permission is wrong |
| Duplicate suspicion | Do not retry blindly; search idempotency/invoice | Master | More than one record exists |
| Dashboard stale | Refresh after confirming network | Master | Database and UI disagree |

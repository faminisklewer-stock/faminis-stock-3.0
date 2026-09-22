# Faminis POS Recovery Procedure

## Frontend down

1. Check hosting status and deployment logs.
2. Roll back to the last known-good frontend deployment.
3. Keep Supabase data untouched unless there is a confirmed database incident.

## Supabase/database incident

1. Stop operational writes if stock correctness is uncertain.
2. Check Supabase status, database logs, and RPC errors.
3. Record the incident time and affected invoices/transfers.
4. Use the configured Supabase backup/snapshot process to restore into a non-production project first.
5. Verify schema, RLS, profiles, stock balances, movements, and RPCs.
6. Restore production only with an approved incident owner.

## Credential exposure

Immediately rotate the exposed credential. The publishable/anon key is client-facing by design, but service-role keys, database passwords, and Auth tokens are not. Sign out affected sessions and review Auth logs.

## User access loss

Use Supabase Auth account recovery or create an administrator-approved replacement user. Preserve the old profile and deactivate it rather than deleting historical ownership.

## Stock discrepancy

Do not overwrite stock immediately. Compare current quantity with the sum of purchase, sale, transfer, return, and adjustment movements. Record an approved adjustment only after the cause is understood.

## Migration failure

Stop the release, capture the SQL error, and do not rerun destructive SQL blindly. Fix the migration or create a corrective migration after testing in development.

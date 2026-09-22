# Faminis POS Production Deployment

## Status

This repository is production-oriented but is not automatically production-ready until the hosting domain, Supabase Auth settings, backup plan, and restore test are configured and verified.

## Prerequisites

- Node.js LTS
- A dedicated Supabase production project
- A HTTPS hosting provider such as Vercel, Netlify, or static hosting
- A production domain
- A separate development project or preview environment

## Environment variables

Configure these only in the hosting provider's production environment:

```text
VITE_SUPABASE_URL=https://your-production-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-publishable-key
```

Never configure `SUPABASE_SERVICE_ROLE_KEY` in Vite, HTML, browser storage, or frontend code. `.env.local` is ignored by Git. Rotate any credential that was accidentally exposed.

## Database release procedure

1. Confirm the production Supabase project and take a backup/snapshot using the features available on the selected Supabase plan.
2. Apply migrations in order from `supabase/migrations/` in a non-production environment first.
3. Run `supabase/tests/00_live_structural_audit.sql` in the target project.
4. Verify RLS, RPC grants, Storage policies, and the expected tables.
5. Apply the same migration set to production.
6. Do not run `0004_seed_demo_products.sql` in a business production database unless demo rows are explicitly required.

If using Supabase CLI, authenticate locally and use a database password interactively. Never commit the access token or database password:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Auth configuration

In Supabase Authentication settings:

- Set Site URL to the HTTPS production origin.
- Add only the production and approved preview redirect URLs.
- Remove localhost URLs from production configuration when no longer needed.
- Use individual user accounts and deactivate users with `profiles.active = false`.

## Storage

Run `0006_storage_policies.sql` after the private `product-images` bucket is available. The bucket is private. Only authenticated users can read; only MASTER can upload, update, or delete.

## Frontend deployment

```powershell
npm ci
npm run lint
npm run build
```

Deploy the generated `dist/` directory. Configure SPA fallback to `index.html`, enable HTTPS, and verify the deployed origin can reach the production Supabase URL.

## Smoke test after deployment

- Login with a production user.
- Confirm the profile and location are correct.
- Read products and stock.
- Perform no dummy sale in a live business database unless approved.
- Check Reports against Supabase data.
- Sign out and confirm protected screens are no longer visible.
- Install the PWA and confirm refresh/update behavior.

## Rollback

- Roll back the frontend to the last known-good hosting deployment.
- Stop applying migrations if a migration fails.
- Restore or reconcile the database only under the documented backup procedure.
- Do not reverse a data migration blindly. Create a corrective migration after inspection.

## Backup and restore

Supabase backup availability and retention depend on the selected plan. Record the configured retention, owner, and restore process outside the repository. Perform a restore rehearsal in a non-production project before relying on the process. A backup that has never been restored is not verified.

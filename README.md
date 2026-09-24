# Faminis POS

Faminis POS is a React + TypeScript operational dashboard for Faminis Barokah. The application is designed around one Supabase project, one PostgreSQL database, one master desktop surface, and one responsive operational PWA.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. The dashboard shell can be viewed without credentials; data mutations require an authenticated Supabase session.

## Supabase setup

1. Create a dedicated Supabase project for the target environment.
2. Apply migrations in order: `0001` through `0006` from `supabase/migrations/`.
3. Run `supabase/seed.sql` for locations, categories, and development settings.
4. Run `0004_seed_demo_products.sql` only in development or an explicitly approved demo environment.
5. Create users through Supabase Auth, then add their rows to `public.profiles` with one of `MASTER`, `OWNER`, `WAREHOUSE`, `LIVE`, or `RUKO` and the appropriate `location_id`.
6. Use `0006_storage_policies.sql` to create the private `product-images` bucket and policies.
7. Apply `0018_web_push_subscriptions.sql` and deploy the `send-transfer-push` Edge Function.
8. Generate VAPID keys, then configure and deploy the push backend:

```bash
supabase secrets set VAPID_SUBJECT=mailto:admin@example.com VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
supabase functions deploy send-transfer-push
```

Set the public key as `VITE_VAPID_PUBLIC_KEY` in the frontend environment.

After deployment, users can open the notification bell and choose **Aktifkan notifikasi perangkat**. The browser subscription is stored per user, and transfer changes send push notifications to active users at the source and destination locations. The private VAPID key must only exist in Supabase Edge Function secrets.

The `record_sale` RPC is the supported sale entry point. It performs idempotency checking, invoice generation, payment validation, row-safe stock deduction, movement creation, and audit logging in one PostgreSQL transaction. Direct stock writes are intentionally not exposed to operational users.

## Architecture

- `src/App.tsx`: responsive master dashboard shell and navigation surface.
- `src/lib/supabase.ts`: typed Supabase client, disabled cleanly when environment variables are absent.
- `supabase/migrations/0001_faminis_pos.sql` through `0006_storage_policies.sql`: tables, constraints, indexes, RLS policies, RPC hardening, demo catalog, and Storage policies.
- `supabase/seed.sql`: safe development seed data.
- `public/sw.js` and `public/manifest.json`: installable PWA shell. The service worker only caches same-origin static shell requests and never caches Supabase responses.

## Validation

```bash
npm run lint
npm run build
```

For production deployment, follow [DEPLOYMENT.md](DEPLOYMENT.md). Admin operations are described in [ADMIN_GUIDE.md](ADMIN_GUIDE.md), and incident procedures are in [RECOVERY.md](RECOVERY.md). Deploy the built `dist/` directory over HTTPS and configure Supabase Auth redirect URLs for the deployed origin.

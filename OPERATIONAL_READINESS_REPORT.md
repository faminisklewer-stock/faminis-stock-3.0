# FAMINIS POS - Operational Readiness Report

Date: 2026-09-23
Environment: repository and local static validation only
Database: Supabase migrations inspected; staging execution was not available
Frontend: Vite/React
Deployment: Vercel via GitHub `main`

## Final Status

**NOT READY**

This status is intentional. The repository does not yet provide evidence for a safe operational pilot. Production data was not modified and no test transaction was created.

## User Test Status

| Test user | Status | Evidence or blocker |
| --- | --- | --- |
| MASTER | BLOCKED | No isolated staging user/session test available |
| OWNER | BLOCKED | No isolated staging user/session test available |
| WAREHOUSE | BLOCKED | No isolated staging user/session test available |
| LIVE | BLOCKED | No isolated staging user/session test available |
| RUKO 1 | BLOCKED | No isolated staging user/session test available |
| RUKO 2 | BLOCKED | No isolated staging user/session test available |
| RUKO 3 | BLOCKED | No isolated staging user/session test available |
| RUKO 4 | BLOCKED | No isolated staging user/session test available |

## Feature Status

| Area | Status | Finding |
| --- | --- | --- |
| Authentication | BLOCKED | Code supports Supabase Auth, but no staging login test was run |
| Authorization/RLS | BLOCKED | Migration and structural audit exist; impersonation tests were not run |
| POS sale | PASS (static) | RPC path, manual price, payment method, idempotency key, and stock guard exist |
| Inventory UI | FAIL | Dedicated Produk and Stok views are not implemented in `src/App.tsx` |
| Purchase | PASS (static) | Purchase RPC is atomic by database transaction semantics |
| Transfer UI | FAIL | Dedicated Transfer view and receiving workflow are not implemented |
| Transfer RPC | FAIL (fixed, unverified) | Partial-receiving reason and active product/destination validation were added; staging verification remains required |
| Transit stock | BLOCKED | RPC exists, but no staging state-machine execution was run |
| Adjustment | PASS (static) | RPC locks the stock row and records adjustment/movement/audit |
| Reports | PARTIAL | Dashboard and sales report exist; required stock/transfer/movement/audit filters and exports are absent |
| Audit | PARTIAL | Core RPC audit writes exist; login/logout and user/permission audit coverage is not demonstrated |
| PWA/mobile | BLOCKED | No viewport or device test was run |
| Master desktop | BLOCKED | No desktop workflow test was run |

## Issues Found

### OP-001 - Missing operational screens

- Severity: Blocker
- Affected roles: MASTER, OWNER, WAREHOUSE, LIVE, RUKO
- Expected: Products, stock, transfer, receiving, and adjustment workflows are usable from the application.
- Actual: Navigation labels exist, but unhandled menu values render the generic dashboard. No dedicated Product, Stock, or Transfer view exists.
- Root cause: `Dashboard` only routes `Kasir`, `Laporan`, and `Pembelian` to feature views.
- Fix: Required before pilot; implement the smallest role-aware screens using existing RPCs.
- Verification: Not yet fixed.

### OP-002 - Staging simulation unavailable

- Severity: Blocker
- Expected: All role, RLS, concurrency, network, and data-integrity scenarios run against isolated test data.
- Actual: Supabase CLI and staging credentials are unavailable in this workspace.
- Fix: Configure a separate staging Supabase project and test users, then run `supabase/tests/17_operational_scenarios.sql` plus authenticated API scenarios.
- Verification: Blocked.

### OP-003 - Partial receiving reason was not persisted

- Severity: High
- Expected: A partial receipt records a discrepancy reason and audit context.
- Actual before fix: `received_quantity` was written, but `discrepancy_reason` was not populated by the RPC.
- Fix applied: `0002_audit_security_and_transfer_fixes.sql` now requires a note for partial receiving and persists it as `discrepancy_reason`.
- Verification: Static SQL inspection and build passed; staging execution is still required.

### OP-004 - Transfer input validation gap

- Severity: High
- Expected: Transfers reject inactive products and inactive destinations.
- Actual before fix: final `create_transfer` validated quantities but not product activity or destination activity.
- Fix applied: `0005_harden_rpc_inputs.sql` now validates both.
- Verification: Static SQL inspection passed; staging authorization test is still required.

### OP-005 - Existing React lint warnings

- Severity: Medium
- Expected: Clean lint before pilot.
- Actual: `npm run lint` exits successfully but reports `react(set-state-in-effect)` warnings in `src/App.tsx`.
- Fix: Deferred until feature screens are implemented so state-flow changes can be made once.

## Automated Evidence

- `npm run build`: PASS
- `npm run lint`: PASS with warnings
- `git diff --check`: PASS
- Supabase CLI migration execution: BLOCKED; CLI is not installed
- Live database structural audit: BLOCKED; no staging SQL session available
- Multi-user/concurrency test: BLOCKED
- Network interruption test: BLOCKED
- Mobile viewport test: BLOCKED
- Master desktop test: BLOCKED

## Data Integrity Checks

No live database was queried by this audit.

| Check | Status |
| --- | --- |
| Duplicate transaction | BLOCKED |
| Negative stock | BLOCKED |
| Negative transit | BLOCKED |
| Orphan records | BLOCKED |
| Stock mismatch | BLOCKED |
| Transfer mismatch | BLOCKED |
| Audit mismatch | BLOCKED |

The safe staging checks are in `supabase/tests/17_operational_scenarios.sql`.

## Required Next Gate

1. Create an isolated staging Supabase project.
2. Create test locations and test users for every role.
3. Implement Produk, Stok, Transfer, receiving, and adjustment screens.
4. Run the structural and authenticated scenario tests.
5. Run mobile and desktop viewport checks.
6. Resolve all blocker findings before changing the status to `READY WITH KNOWN ISSUES` or `READY`.

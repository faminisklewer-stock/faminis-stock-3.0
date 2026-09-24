# Staging E2E tests

These tests require a real authenticated session state. Do not commit the storage-state JSON.

PowerShell example:

```powershell
$env:E2E_BASE_URL = "https://staging.example.com"
$env:E2E_STORAGE_STATE = "C:\secure\faminis-staging-storage.json"
$env:E2E_ROLE = "operational"
npm run test:e2e -- --project=mobile
```

For the Master desktop smoke test, use `$env:E2E_ROLE = "master"` and `--project=desktop`.

The test suite intentionally does not submit a sale or mutate transfer state by default. Add a dedicated staging seed and an explicit mutation flag before testing destructive or financial workflows.

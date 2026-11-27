# Ball46 — Signal age change ONLY

Scope: `FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60 * 1e3` -> `0`.

No other logic, limits, HUB, Ledger, 429, or UI change is authorized in this branch.

This is an **offline patch** to apply only to a VERIFIED export of the currently ACTIVE Worker, followed by tests and separately approved deploy. It does not change Production itself and cannot use old source as the replacement.

Commands:
```
node patch-live-engine.test.mjs
node patch-live-engine.mjs active-worker-export.js patched-worker.js
```

Safety: exact-match and baseline checks. No API calls, workflow trigger, or deploy.

Status: Source patch prepared; actual current production active Worker not exported here; Production unchanged.

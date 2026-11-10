# Cursor-only Statistics — isolated validation

Scope: remove the shared frontend reader's unconditional `directAll()` request and its now-unused function. The existing cursor loader, record-completeness checks, UI, cache and request coalescing remain unchanged. `patch.mjs` enforces an exact inverse diff against the captured workspace asset.

This folder is a TEST experiment, not a deployed Website patch. No Engine module, ledger, scan cadence, setting or public Production resource is changed.

- Core tests cover full IDs/totals at 0, 1, 499, 500, 501, 2000, 5000 and 15000 rows; malformed/error/timeout responses; changed generations; cursor loops; duplicate/missing records; wrong counts; incomplete pages; cache/coalescing; and source drift.
- Engine contract tests evaluate the actual captured Engine class with mocked storage. They compare unpaged versus cursor results using the actual `statisticsLedgerResponse` and `latestLedgerRows` methods, for up to 5000 rows. No scan or storage write executes.
- Browser cases run the captured site HTML/JS/CSS with only the workspace reader patched, on 1366px/390px and dark/light. The API server uses two recorded score fixtures and 1501 synthetic ledger records. It prohibits unpaged Statistics calls. It exercises two navigation/history rounds, reload persistence and a simulated cached score change.
- Dynamic static-asset query aliases are served only if captured bodies for a pathname are byte-identical. Cloudflare zone challenge scripts are isolated with 204 on localhost; all application resource errors remain test failures. Images/fonts may be fetched from the existing public static URLs. External API/provider requests are blocked and counted.

Limits: this validates code and UI contracts using recorded/synthetic inputs. It does not measure Production heap, current LIVE accuracy or all concurrent real viewers. It cannot prove all causes of the shared DO memory failure are resolved. Any real Worker Preview or activation needs fresh actual-source/config validation, a guarded baseline and existing-log checks; avoid unpaged Statistics stress reads.

Commands (from repository root):

```text
node work/statistics-cursor-only-test-20261110/core-test.mjs
node work/statistics-cursor-only-test-20261110/engine-contract-test.mjs
node work/statistics-cursor-only-test-20261110/browser-test.mjs
```

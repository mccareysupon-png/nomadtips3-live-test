# Ball46 Phase 1 — staging only; NOT ready to deploy

## Intent
Keep the live Engine's **current** ledger and settlement implementation unchanged except for the narrow missing-final reconciliation rules.

The guarded offline patch makes six textual modifications to an **export of the exact currently deployed Engine**:

1. Remove Signal-created-at 45-minute eligibility delay.
2. Do not exclude finished or unknown fixtures merely because they remain on the board. Truly live fixtures continue through normal scan.
3. Make individual final-probe queue size configurable, with the existing 3-per-scan default and hard maximum of 12. **Do not raise without verifying rate budget across all Workers.**
4. Honor provider Retry-After upon 429.
5. Preserve Retry-After on stored error state.
6. Use the saved Retry-After timestamp when deciding whether a 429 fixture is eligible again.

No file here calls external services or deploys.

## Preconditions
- Obtain a source export of the verified **active Production Worker** from Cloudflare. Never use old Engine 343 files from a Git branch as a replacement.
- Verify Cloudflare active version ID and source checksum immediately before and after preparing the patch.
- Ensure no parallel Engine deployment is underway.
- Back up the active worker code/config and rollback ID.
- Run full syntax and behavioral QA with anonymized actual pending signals before contemplating Production.

## Offline usage

    node patch-live-engine.test.mjs
    node patch-live-engine.mjs ACTIVE_ENGINE_EXPORTED.js phase1-engine.js

Output is a different file and cannot be overwritten. If the source shape changes or any pattern appears zero/multiple times, the tool refuses to patch.

## QA completed at creation
- PASS: Synthetic snippet 6 modification checks and rejects a second application.
- PASS: Transform patterns matched the recovered **Oct 10** inspected Engine 343 function source, including 429 and board guards.
- NOT TESTED: Full current Production bundle compile, Cloudflare runtime and live downstream settlement.

## Blocking items before claiming Phase 1 complete
- Apply and QA against the latest exported active Worker, not the Oct 10 logged subset.
- Implement authoritative pending Fixture ID queue that spans Working Signals and Ledger without rewriting settled history.
- Fix HUB finished-window pagination and cross-day coverage (max pages and vendor rate limit) without increasing account-wide 429 exposure.
- Replace the remaining individual fallback bottleneck with a budgeted **batch FT** path, validating has_more and preserving all pending IDs.
- End-to-end test FT-to-Ledger and rollback against current state. No production deploy has been made.

**Do not approve merging or deploying this draft as a completed Phase 1. Phase 2 (Early WIN) is separate and not part of this change.**

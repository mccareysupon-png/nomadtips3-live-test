# BALL46 Statistics Fast V1 — Production release record

**Deployment status:** COMPLETE / VERIFIED / ACTIVE 100%
**Date:** 2026-11-16 13:26 UTC (20:26 Asia/Bangkok)

- Worker: `ball46-production`
- Activated Worker version: `d2fe6c5e-5602-40f9-9b6f-d4d8674de638`
- PRE-V1 rollback Worker version: `828ddb27-bec4-47f8-a41f-fc7469b0152a`
- Deployment run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43875124861
- Git commit authorized activation: `fde8ca594f51e2d503b26fe92c1b9fe34443a2c6`
- Prior validation only (no cutover): run 43874612274
- Candidate and post-activation browser QA both passed. No automatic rollback triggered.

## Owner-approved V1 scope

- Show verified saved Statistics overview/graph in the existing native Statistics card slot, not a duplicate placeholder.
- No full historical Ledger API request until user requests detailed history or uses a filtered market.
- Dedicated, read-only source, isolated fast-index cache: precomputed financial graph and compact verified summary. Refresh scheduler every 5 minutes. Stale or failed fast index must fall back to the original full-renderer route.
- Existing desktop card's approved eight metrics and outcome bar preserved; mobile avoids the desktop-only outcome bar.
- Preserved 49 original Worker modules, original existing bindings/config/assets (only an extra read-only service binding added), and all live settlement/Engine/Ledger/original KV resources unchanged.

## Measured live-browser checks

- PC navigation to meaningful first-paint: 2,929 ms; preview script paint: 207 ms.
- Mobile navigation to meaningful first-paint: 4,497 ms; preview script paint: 361 ms.
- Native full history still loaded on click, 33 PC and 37 mobile Statistics API reads in this run; 48 financial chart daily points; record totals can advance during testing.
- AH direct filtered link and simulated snapshot 503 both recovered via verified native full history.
- No JavaScript errors reported; no live renderer overflow; no duplicate chart; source module and binding invariants checked.
- Public site was smoke checked after activation on both direct Worker and website hostname.

## Still deferred to V2

Pagination/detail request speed, full filtered snapshot precompute, more precise source content revision/delta feed, and 7D/30D/90D precompute. V1 fast-paint timing does not imply complete historical load timing.

## Rollback

Restore **100%** traffic to Worker version `828ddb27-bec4-47f8-a41f-fc7469b0152a` if V1 regresses; do not roll back the engine or mutate historical ledger. Preserve current version `d2fe6c5e-5602-40f9-9b6f-d4d8674de638` as post-V1 baseline for subsequent changes only after fresh verification.

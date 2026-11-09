# BALL46 static asset speed patch — TEST ONLY

Branch: `codex/ball46-static-speed-20261110`.

## Implemented

The final homepage response receives content-hash query keys on 44 verified public JS/CSS references. Existing query values, tag order, script attributes and every asset body remain unchanged. The unchanged screen-refresh script already has immutable caching and is left alone.

A small outer Worker wrapper delegates to the entire current Worker first. Only a successful GET for an allowlisted hash URL with a matching SHA-256 body can receive `public, max-age=31536000, immutable`. Source drift produces no-store. Authorization, Set-Cookie, explicit private responses, identity-dependent Vary, encoded responses, non-JS/CSS types, errors and other methods are not made cacheable. HTML remains no-store. No cache rule, Cache Everything, Rocket Loader, provider request or polling change is involved.

`prepare.mjs` verifies exact captured source hashes and builds the candidate. Its inverse assertion recovers the entire original main module byte for byte. This is one existing module change plus one new helper module; all 40 other existing modules stay byte-identical. The unrelated pending mobile bar repair is not included.

## Production baseline and rollback

Read-only audit run: [42716700468](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42716700468).

- Active version: `e41be683-e67f-4023-9492-2b114203f0d7`.
- Deployment: `20efc3b9-6bd4-446b-9cb1-2a9a9ce526e2`.
- Main SHA-256: `52c949aeb3145efd1fdc797314ae53d3dbea946405361cdbebe7d741a530e366`.
- 41 existing modules; bindings/assets/settings/Cron fingerprinted in `fresh/report.json`.

These are captured values, not permission to overwrite a later release. Before any candidate upload or activation, re-read active version, module/config fingerprints and exact public asset hashes. Stop and rebase if any differ. Preserve all modules and bindings, including inherited secrets, assets, services and schedules. Verify a Worker Preview with the actual runtime before activation. Rollback must restore the immediately preceding owned active version; if the baseline changed, do not use this old version blindly. No global purge is necessary: restored no-store HTML references the original URLs, and the hash URLs become unreferenced.

## Tests and limits

Contract tests cover content hashes, source drift, legacy paths, duplicate/unknown query keys, methods, API paths, private/auth/cookie policies, response type/encoding, unchanged non-home routes and exact HTML rewriting.

Browser tests use captured real public asset bytes and a recorded real fixture/signal snapshot. PC 1366px and mobile 390px, dark/light, baseline/candidate, cold/return navigations are compared. Screenshots and test JSON are attached to the Actions run. Native browser HTTP caching is tested without request interception. API calls are answered locally and compared by path/count; provider calls are zero. This verifies preservation of the recorded display, not live provider accuracy or backend health.

Final run [42718053274](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42718053274) passed **27 cases: 19 contract cases and 8 browser cases**, including both cold and return navigations in each browser case. Browser DOM parsing confirms every inline script/style body remains byte-identical. Return-navigation JS/CSS origin requests fell from 36 to zero in every PC/mobile/theme case. Nine of the original 45 resources were already fresh in the browser cache. The 44 newly content-addressed resources total 724,230 decoded bytes, not compressed bytes saved on the wire. Some baseline responses can revalidate with 304, so request reduction is the strongest proven benefit.

Final laboratory first-match times were mixed:

| Case | Cold before → after | Return before → after |
| --- | --- | --- |
| PC dark | 536 → 612 ms | 300 → 312 ms |
| PC light | 529 → 501 ms | 385 → 307 ms |
| Mobile dark | 312 → 306 ms | 194 → 129 ms |
| Mobile light | 290 → 280 ms | 180 → 123 ms |

These are single local fixture samples, not Production speed measurements or a reliable percentage gain. The PC dark case regressed in this sample, so elapsed-time improvement is not established across every condition. This patch does not establish a faster cold first visit. The consistent proven benefit is eliminating repeat JS/CSS origin requests. FCP and a long-task-based blocking estimate are recorded; no INP/LCP claim is made.

Frontend deferral and HTML-wrapper consolidation are deliberately not implemented without dependency profiles and measured evidence. No Engine, Signal formula, odds, Ledger, Settlement, Member, Stripe, theme or live update behavior is changed.

## Deployment state

No Worker version uploaded, Production deployment, merge, traffic change, cache purge or Cloudflare settings mutation. The candidate is for review and actual Worker Preview verification before a separately authorized Production rollout.
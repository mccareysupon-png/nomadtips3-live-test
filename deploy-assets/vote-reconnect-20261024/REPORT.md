# BALL46 Vote Reconnect — verified Production

Completed 24 October 2026, 23:12 ICT. Existing voting is retained.

## Problem and correction

The vote proxy looked up fixtures only in HUB `/snapshot`, while the website selects its authoritative board through the existing `engineBoardResponse` ENGINE/HUB logic. Captured evidence included website-live fixtures returning `FIXTURE_NOT_FOUND` from voting. The proxy now reuses that exact board selection function, with a clean GET even when the caller submits a vote. Optional full-market odds enrichment is omitted only in the local vote-status read; public board behavior and Cloudflare bindings are unchanged.

Browser requests previously stopped after 12/15 seconds. Vote reads/writes now have a bounded 45-second timeout. A pending read is not restarted by polling. Fixture changes discard obsolete responses. Failed connections expose RETRY VOTES, which only reads saved votes. Missing/closed fixtures have a distinct closed state. A POST still rechecks authoritative match status before writing.

## Production identity

- Repository: `mccareysupon-png/nomadtips3-live-test`
- Branch: `codex/ball46-vote-reconnect-20261024`
- Worker: `ball46-production`
- Active version: `02108724-ac78-4575-a98a-f7ee40053814` at 100%
- Deployment: `6cbec888-e950-4cab-a26d-e36112083fe8`, activated 24 October 2026 23:10:24 ICT
- Source/browser completion commit: `a7512cf6c3fcfc12b1350cca5f62addb83298a80`
- Activation commit: `45071cb8b359cde33d194aeffbefb50a3d5726ed`
- Candidate workflow: [40109815504](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40109815504), SUCCESS
- Activation workflow: [40110218208](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40110218208), SUCCESS

## Narrow files

Under `deploy-assets/vote-reconnect-20261024/`: `vote-proxy.mjs`, `vote-read-state.mjs`, `prepare.mjs`, generated `build/browser.js`, `build/b46-pv9-browser.mjs`, `build/b46-pv9-proxy.mjs`, `build/patch.mjs`, `build/manifest.json`, regression tests, provenance, guarded runner, request/browser-proof/rollback records. Workflow: `.github/workflows/ball46-vote-reconnect-20261024.yml`.

The current Production main module is wrapped rather than replaced with an older source. All 20 original modules remain; non-main module bytes are unchanged. Two scoped modules are added. Homepage HTML only changes the Vote script cache key. No new jersey or other public asset is added.

## Verification

- Syntax/build checks and 20 meaningful tests passed: 10 proxy/status/security tests, 3 asynchronous read-flow tests, 7 real-vote presentation threshold tests.
- Preview API integration: real stored votes, 1 → X → 2 → 2, total increases only once and persists on GET.
- Actual browser Preview: saved HOME, changed to DRAW, total remained 1 vote, refreshed and recovered DRAW. RETRY VOTES recovered a failed connection. QA POSTs use Preview scope only.
- Desktop Light/Dark and native mobile 390px checked. No horizontal overflow or browser console errors in the verified run. The existing native mobile shell remains dark. No CSS/layout changes are included.
- Production UI and independent API read fixture `203351752` successfully, with actual Production 0 votes while Preview has 1. No QA POST was sent to Production.
- Performance height remains 99px; mobile match cards remain 142px.
- Both `ball46.com` and `www.ball46.com`: 113 audited paths per domain match expected status/hash, including preserved baseline 404 entries. Engine, Full Market, board, Signal, Statistics and Vote health checks pass.
- All 9,443 previously SETTLED ledger records retain their protected fingerprints.
- Bindings, compatibility, assets config, schedules, domains/routes and bound service versions remain unchanged. Latest PC Sidebar Compact, 12 jerseys, Featured pairing, Engine343, SIGNAL, Statistics, Member and private vote storage remain intact.
- Percentages still appear only at 20 actual votes. No seed votes, fake percentages or fabricated Form Model history. Form Model remains Unavailable until verified last-five data exists.

## Evidence

Local evidence directory: `outputs/vote-reconnect-20261024/`.

- `api-mismatch-before.json`, `baseline-active.json`, `baseline-version.json`, `before-production.png`
- `candidate-vote-saved.png`, `candidate-vote-updated-light.png`, `candidate-vote-updated-dark.png`, `candidate-reload-persisted.png`, `candidate-mobile-vote.png`
- `production-vote-light.png`, `production-vote-dark.png`, `production-vote-mobile.png`
- `production-ui-pc.json`, `production-ui-mobile.json`, `independent-production-api.json`, `live-deployment.json`, `activation-success.json`

GitHub evidence: `audit-last/candidate.json`, `audit-last/activate-40110218208.json`, `browser-proof.json` and the workflow audit artifact. No credentials are included.

## Rollback

Verified baseline is version `246319a6-203b-475f-afd6-95ed792b35be`, deployment `2de3db66-daf6-48f3-8941-70c07b029674`, containing the latest PC Sidebar Compact and V8 card. Use this rail's guarded restore only while the owned V9 candidate is still active, with freshly verified configuration/routes. Preserve votes and every private backend. Never restore the older pre-sidebar V8/V6 baseline. See `ROLLBACK.md`.

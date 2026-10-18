# BALL46 — Result Sidecar Shadow release 18 October 2026

## Cloudflare installed (isolated)
- Worker: `ball46-multisource-shadow-20261018`
- Deployment ID: `9395e0e2-800b-4c18-b2e3-86e4ba3e737a`
- Active Shadow version: `e8788f32-78c5-45e5-bbc9-7a846809a684`, 100%.
- [Hosted Shadow deploy run 39084509399](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39084509399)
- `workers_dev=false`; no routes, crons, Hub or Engine service bindings.
- `GOALOO_POLL_ENABLED=0`, `GOALOO_UTC_CERTIFIED=0`, `GOALOO_FT_CERTIFIED=0`, `ENABLE_NATIVE_FORWARD=0`.
- These flags are intentional: live result write into Production is **NOT ENABLED**.

## Proved in real local Cloudflare DO
- `workers/ball46-result-sidecar/src/worker.mjs` captures canonical 5USD fixtures and provider IDs **before FT**.
- A stored Goaloo match ID remains usable when the 5USD Hub stops listing the match.
- Two identical Goaloo FT observations at least 60 seconds apart map back to the preserved 5USD fixture ID; no corners required.
- Cross-provider identity logic is one-to-one, UTC/league/name checked, team sides not interchangeable. Uncertain matches HOLD.
- Durable storage v3 now uses **separate records per fixture, reverse source ID and FT observation**, not a growing single-value blob.
- Real workerd replay of **1,443 canonical fixtures and 752 simulated Goaloo fixtures**: all 752 intentionally matching independent fixtures matched, 84ms in that specific replay; this is **not an empirical precision/recall rate on live football**.
- [GitHub Actions DO run 39084464614](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39084464614)

## Checked original Engine stayed unchanged
- Engine: `nomadtips3-engine-343`
- Original deployment ID: `1c813fd8-7b0d-4d86-8482-ceb2797471e0`
- Version `9b363777-64fc-4a48-a10a-0fad822640cb`: **100%**, unchanged from pre-sidecar audit.
- [Comparative READ-only Cloudflare check 39084621138](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39084621138)

## Production release gates still not passed
1. The native Engine **Ledger V2 authoritative writer** must be verified/connected to the sidecar's FT handoff, with an isolated Ledger V2 rehearsal and safe rollback. Historical v5 has older signal storage; **DO NOT deploy PR #362** to Production.
2. Goaloo feed raw kickoff timezone and 90-minute score semantics, league aliases, and **rights for commercial use** still require independent verification. Live name-matched samples are not proof of universal identity or provider consent.
3. A separately authorized secure Engine-service credential must be established; do not reuse the 5USD API pricing key as a new public result-ingest token.
4. Verify race/idempotency using the *current* Engine Ledger V2, historical PENDING signals and Member/Statistics views, not a substitute simulated ledger.
5. Only after these gates may the Shadow be connected with scheduled polling and controlled results forwarding; the original 5USD pricing engine and native betting rules must remain untouched.

**Current state: isolated hosted Shadow deployment COMPLETE. End-to-end 5USD/Goaloo → current Production native settlement NOT COMPLETE; no Production settlement writes.** This report must not be used as evidence that production auto-settlement is activated.

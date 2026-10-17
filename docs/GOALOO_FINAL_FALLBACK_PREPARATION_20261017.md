# BALL46 — Goaloo final-result backup (staging only)

**Branch purpose:** prepare a read-only alternative evidence source for PENDING football results when the upstream has BACKOFF or is stale. NO PROD deployment. NO change to existing odds, entry snapshots, settlement formulas, signal selection or Member1 user interface.

## Verified source paths

- Goaloo parsers already appear in `.github/scripts/the_king_engine_v8.py`, `.github/scripts/the_king_direct_reconcile.py` and `car3-1-hybrid-live-engine/worker/src/goaloo-clock.js`. Those are not evidence of a live Member1 connector.
- `workers/nomadtips3-live-engine-5dollar/src/index.js` is a standalone S8 **Bet365 live AH price** adapter, not the results settlement owner.
- Member1 branch `member/ball46-member-v1-20261008`, `ball46-member/src/worker.js`, reads `/api/engine/statistics`, `/api/engine/board` and `/api/engine/history` from the **main** Ball46 website.
- Existing read-only 3.43 diagnostic references Hub `/snapshot`, Engine `/signals` and Engine `/statistics`. It does not establish an authorized POST result-ingestion route.

## Preparation gates

1. **Goaloo source reader** reads only the known `bf_us.js` A/B index, preserving source ID, state, names, league, kickoff, final score. Verify ongoing access and redistribution rights before live fetch.
2. **Time verification** uses explicit Goaloo-to-UTC timezone normalization. Do not guess timezone or treat 90 minutes elapsed as FT. Require `state === -1` and at least two matching FT observations separated by 60 seconds.
3. **Mapping** uses persisted `Ball46 fixtureId <-> Goaloo id` as primary cross-reference. Verify HOME, AWAY, league and UTC kickoff within 30 minutes even with exact ID; otherwise only strict identity and UTC matching. Reject duplicate or contradictory candidates. Alias names only with explicit verified registry.
4. **Engine343 port** produces `FINAL_SCORE_EVIDENCE_V1` with original engine fixtureId (never substitute provider ID). Integrate later with the *existing* authenticated settlement owner as an idempotent PENDING->SETTLED transition. Never regrade or edit /statistics directly.
5. **Member signal port** (distinct from Member1 mirror) can provide existing `member-live-settlement.js` fixture input only after the numeric fixture ID mapping is verified and runtime ownership confirmed.
6. **Audit/hold** statuses include unknown timezone, mismatch, ambiguous match, source not FT, score invalid, primary final conflict, missing confirmation. Goals do NOT imply CORNERS/CARDS stats; those markets remain PENDING without verified final statistics.

## Not connected

No real Goaloo feed has been fetched for this staging branch; no Goaloo source timezone confirmed; no Engine343 ingest endpoint is verified; no databases were modified; no production Workers or Member1 assets were deployed.

Full independently tested read-only adapter and test bundle was produced as `ball46-goaloo-final-fallback-prep-20261017.zip` in the associated ChatGPT conversation. Do not treat this README alone as a functional, deployed adapter.

Before production: lock actual current Cloudflare Worker versions and source commits for HUB343/ENGINE343; verify source licensing and timezone; integrate guarded write to settled pipeline; run replay and shadow comparison against `/api/engine/statistics` and `/api/member/daily`, preserve rollback; request explicit deployment authorization.

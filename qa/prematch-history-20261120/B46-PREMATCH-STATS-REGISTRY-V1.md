# BALL46 Pre-Match Statistics Registry V1 — TEST ONLY
**Established:** 22 Nov 2026. **Scope:** Existing `ball46-prematch-only-test-20261120` Durable Object only. Not the History Cargo Registry (HCR), Live Statistics, or Production.

## Non-negotiable design

**Prediction Bot → Immutable 1X2/BTTS ledgers → change-aware event journal → persisted daily/market Snapshots → current Pre-Match Predictions & Statistics pages.**

The two source ledgers are NEVER rewritten by this registry. An existing 1X2 history is seeded **once** to independent Snapshots by an authorized sync; 1X2 formula and original history stay unchanged. BTTS is separately issued only with real team history (10 per team) plus verified Bet365 BTTS quote. One fixture can have a 1X2 prediction and BTTS prediction: different market keys, no collision. Neither forecast counts toward WIN/LOSS/P/L before verified FT settlement.

## Distinct persistent tables in existing TEST Durable Object

| Table | Identity | Role |
|---|---|---|
| `test_pick_1x2` | fixture ID | Existing original 1X2 prediction ledger, read-only to registry |
| `test_pick_btts` | fixture ID | Independent BTTS prediction ledger |
| `b46_pre_stats_event_test` | **(market, fixture_id)** | Processed prediction/settlement event marker, with `revision` and `indexed_at` |
| `b46_pre_market_snapshot_test` | **market** | Persisted lifetime counts for **1X2, BTTS, TOTAL** |
| `b46_pre_daily_snapshot_test` | **(market, business_day)** | Persisted selected, settled, WIN/LOSS/PUSH and net unit P/L for historical graphs |

Registry code: `B46_PREMATCH_STATS_REGISTRY_V1`. All three market categories are maintained in the **same SQL transaction** whenever a new/changed ledger entry is noticed. Running sync twice is idempotent: zero new events, no changes to totals. Source corrections reverse the old Snapshot deltas and apply the corrected deltas. A failed validation rolls back the entire transaction. No API calls.

## Stat rules

- `WIN RATE = WIN / (WIN + LOSS) × 100`; when denominator = 0, show no percentage. PUSH/DRAW is excluded.
- P/L in units: WIN = `frozen_decimal_odds - 1`, LOSS = `-1`, PUSH = `0`. Only confirmed full-time outcomes count.
- Each market prediction is its own entry. **TOTAL** adds 1X2 + BTTS market entries and P/L without guessing, duplicate fixture IDs between different markets are allowed.
- Each `picked_at` increments the **selection date**. A settlement at `settled_at` increments the **settlement date**. Late match results appear on the day settled, not the day predicted.
- Day cutoff: **06:00 Europe/London** including summer/winter daylight saving changes. Derived using existing `londonAccountingWindow` utility.
- 30D/90D graphs read **persisted daily Snapshot records** only, not individual matches.
- Snapshot reads use only registry tables: no runtime full-history recomputation of WIN/LOSS/P/L. Event sync checks only not-yet-indexed or changed records via indexed join.

## Existing TEST website

The UI, styles and card renderer already exist; no new page is permitted. Existing Pre-Match tabs: **Predictions** (1X2 + BTTS cards, chronological kickoff), **All / 1X2 / BTTS** (market-specific statistics). `/preview-data` retains the original 1X2 ledger and list, adds `bttsLedger`, `allLedger`, `statsRegistry`, `marketDailyBooks`, `bttsDailySeries`, `allDailySeries`. BTTS/Total statistics and graphs read Snapshot tables, not raw outcomes. 1X2 original source and formulas are preserved.

User-facing test links:
- Predictions: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=predictions`
- BTTS: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=btts`
- All: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=all`

## Authorized TEST-only maintenance & evidence

- `POST /prematch-stats-registry-sync-test` — owner-authenticated, process changed source ledger entries, seed existing 1X2, and confirm Snapshot audit
- `GET /prematch-stats-registry-test?days=30` (or 90) — owner-authenticated lifetime/daily Snapshot read, no writes
- `GET /prematch-stats-registry-audit-test` — owner-authenticated one-off reconciliation vs original source ledger, never run per frontend page view
- Automatic `/btts-cycle-test` — existing Pre-Match TEST cron rhythm, calls snapshot sync **after** BTTS issue/settlement
- Settlement and manual import paths update the Snapshot after a genuinely new settlement, not on repeated read-only user access

**Isolation:** No new upstream 5USD requests; original 1X2, HCR, HUB, receiver, Live engine, Live Statistics and all Production Workers remain unchanged. Frontend is unchanged by this registry deployment.

## Acceptance criteria

1. Same real fixture can appear twice across two distinct markets; never twice within a market.
2. Source ledgers unchanged after Snapshot sync and after read-only browser navigation.
3. Idempotency / corrected settlement / invalid-source rollback verified.
4. 1X2/BTTS/TOTAL Snapshot = source ledger reconciliation.
5. Trial historical BTTS has 20 real score results and one 10+10 match ready; no fabricated Bet365 quote, and no artificial published BTTS pick.
6. 30D/90D graphs read daily Snapshot; response remains fast without backward recalculation.
7. Only deploy to isolated TEST after QA; user reviews actual original Pre-Match website and receives links.

# NOMAD Live Engine 3.42 — Git Blueprint

This directory is the isolated backend blueprint for NOMAD Live 3.42. It is intentionally separate from the proven 3.41 engine and does not change or import 3.41 runtime code.

## Flow

`TotalCorner -> NOMAD event gate -> M88 price judge -> Final Judge -> SIGNAL LOCK -> Worker API -> D1 -> Statistics / History / Health`

### Source responsibilities

- **TotalCorner**: live match/event carrier and rolling event evidence.
- **NOMAD**: event-condition decision logic.
- **M88**: fail-closed HOME Asian Handicap price evidence.
- **Signal Lock API**: validates fresh evidence, re-checks the TotalCorner live match, then writes an idempotent immutable entry record.
- **D1**: authoritative signal/history database once provisioned.
- **LocalStorage**: transition/cache only; it must not be the long-term source of truth.

## Current endpoints

- `GET /feed` — normalized TotalCorner live feed with rolling snapshots.
- `GET /health` — feed health plus central-ledger readiness.
- `GET /contract` — versioned API/flow contract.
- `GET /api/v1/health` — Worker/D1/auth/settlement readiness.
- `POST /api/v1/signals/lock` — protected idempotent Signal Lock.
- `GET /api/v1/signals` — central history.
- `GET /api/v1/statistics/summary` — server statistics.

## Signal safety

Signal Lock is fail-closed:

- M88 evidence must be `VALID` and fresh.
- Non-zero M88 HDP must carry an explicit sign. Unsigned non-zero HDP is rejected even if a caller labels it valid.
- TotalCorner evidence must be fresh.
- The match id and team names must still exist in the Worker live feed.
- `signal_key` is unique; the default key is `3.42:<matchId>:HOME`, so retrying a lock is idempotent.
- Entry evidence is stored separately from settlement.

## D1 schema

Migration `migrations/0001_signal_ledger.sql` creates:

- `signals`
- `signal_evidence`
- `settlements`
- `engine_configs`
- `system_health`
- `signal_audit`

Settlement grades are ready for `WIN / HALF_WIN / PUSH / HALF_LOSS / LOSS / VOID`.

**Automatic live-AH settlement is intentionally not wired yet.** The exact NOMAD rule for entry-score versus final-score settlement must be verified before enabling it. This prevents a structurally clean system from calculating the wrong ROI.

## Deployment boundary

This Git branch is a blueprint, not a deployment.

`wrangler.toml` deliberately contains **no fabricated D1 database id**. Before deployment:

1. Create dedicated D1 databases for 3.42 TEST and/or production.
2. Add the real `SIGNALS_DB` binding and real database id to Wrangler.
3. Apply `migrations/0001_signal_ledger.sql`.
4. Add Worker secret `SIGNAL_WRITE_TOKEN`.
5. Optionally set `SIGNAL_WRITE_ORIGIN` for the protected writer surface.
6. Run `npm test` and `npm run check`.
7. Dry-run Wrangler.
8. Deploy the isolated 3.42 Worker only after review.
9. Connect the browser using dual-write/fallback first; do not delete LocalStorage fallback until counts match.

No workflow in this branch deploys this Worker automatically.

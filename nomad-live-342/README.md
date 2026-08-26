# NOMAD Live 3.42 — Isolated Human Logic Build

This directory is a separate 3.42 test project inside the existing GitHub Pages test repository. It does not modify files under `nomad-live/` (3.41).

## Decision flow

`TotalCorner → Event → Candidate → Price Court (7) → Normalize → Freshness → Consensus → เซียน K Final Judge → Signal`

Price Court slots:
- Pinnacle
- Bet365
- Marathonbet
- M88
- William Hill
- 18BET
- Ladbrokes

## Safety / isolation

- Settings key: `nomadSettings342`
- Ledger key: `nomadLedger342`
- No 3.41 engine endpoint is referenced.
- No 3.41 storage key is referenced.
- No direct bookmaker slot is labelled LIVE unless a future backend adapter actually proves it.
- Current GitHub Pages build uses deterministic fixtures for human logic inspection.
- Stale / suspended / missing / mismatched price observations fail closed and are excluded from consensus.

## Human review targets

1. Event gate passes only within configured conditions.
2. Candidate opens Price Court only after Event PASS.
3. Seven bookmaker observations preserve RAW AH notation.
4. Normalizer converts split lines such as `0/-0.5` to `-0.25`.
5. Stale or invalid sources are excluded.
6. Consensus counts only same normalized AH line.
7. Final Judge emits SIGNAL only when Event PASS and Price Confirmed both pass.
8. Signal snapshots write only to the 3.42 local ledger.

## Not yet claimed

The static Pages build does **not** claim live direct bookmaker connectivity. The adapter boundaries are intentionally present as test slots for the next backend phase.
# Sirius stats + automatic settlement — 2026-09-14

Scope: Prediction3 / Verdict of Sirius only. No NOMAD Live 3.41 or 3.43 files are changed.

## Purpose
- Record the two 2026-09-13 Sirius winners correctly.
- Publish the 2026-09-14 official supported-market picks with international team names.
- Keep the legacy Prediction3 ledger intact as a rollback baseline.
- Harden automatic fixture matching and settlement against provider naming differences and stale/wrong fixture IDs.

## Current data layer
- `prediction3/data/current.json` is the small authoritative current-day patch.
- `prediction3/ledger-overlay.js` merges the current patch over the legacy `prediction3/data/ledger.json` in the browser.
- The Prediction3 tracker reads `prediction3/data/current.json` directly for active picks.

## Automatic settlement safeguards
- International/provider aliases are matched symmetrically (for example `FC Nordsjælland` ↔ `Nordsjaelland`, `AGF Aarhus` ↔ `Aarhus`, `Como 1907` ↔ `Como`).
- A configured fixture ID is accepted only when home and away identities agree.
- API-Football final-score fallback can run after the safe finish window even if a stale live row remains.
- Official current selections use only markets supported by the settlement engine: BTTS and AH.

## Rollback
Revert this change set to restore the previous Prediction3 behavior. The legacy `prediction3/data/ledger.json` is intentionally not modified by this change.

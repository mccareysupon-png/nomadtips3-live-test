# CAR 3.1 — Live Detection + Settings V1

Status: **SHADOW / RESEARCH ONLY**

## Live Detection Dashboard

Implemented browser UI under `web/` with:

- live fixture/candidate summary counters
- candidate list with mini pressure sparkline
- match scoreboard and source provenance
- comparison bars for possession, attacks, dangerous attacks, shots, shots on target, corners and red cards
- Momentum/Pressure timeline with threshold line
- Dangerous Attack timeline
- Attack Evidence delta cards using the configured Engine 3-style thresholds
- Odds tabs for 1X2, Asian Handicap and Over/Under
- event timeline
- source trace
- decision gates and SHADOW SIGNAL / NEAR / WATCH result
- responsive desktop/mobile layout

The current dashboard intentionally uses clearly marked demo data until a real source collector is connected.

## Settings

CAR 3.1 keeps the Engine 3 condition baseline and adds Shadow-only controls.

### Engine 3 baseline retained

- HOME / AWAY / BOTH
- minute start / end
- WIN / AH market baseline
- odds min / max
- AH line min / max
- Momentum threshold
- Attack Evidence master
- Dangerous Attacks / Shots / Shots on Target / Corners delta thresholds
- evidence requirement 1 / 2 / 3 / ALL
- goal-gap limit
- confirmation rounds
- daily signal limit

### CAR 3.1 additions

- O/U market preview
- Primary / Fallback / Backup data source
- source refresh interval
- source freshness ceiling
- match-resolver confidence threshold
- require complete core stats
- API verification policy: ALWAYS / CANDIDATE_ONLY / SIGNAL_ONLY / OFF
- source conflict policy: PASS / USE_PRIMARY / USE_API
- maximum source mismatch percentage
- red-card policy
- editable Momentum weights for Attacks, Dangerous Attacks, Shots, SOT, Corners and Possession
- trend window and chart history window
- optional pressure-spike filter

## Safety differences from Engine 3

CAR 3.1 validation blocks two ambiguous Evidence configurations before Run Preview:

1. Attack Evidence is ON but all evidence sub-rules are OFF.
2. Numeric evidence requirement is higher than the number of enabled evidence rules.

Settings are currently saved in browser `localStorage` only and drive the Shadow dashboard preview. They do not call Engine 3, LINE, Settlement, D1 Production or a real betting endpoint.

## Next integration phase

1. Connect an approved/public-source collector.
2. Persist snapshots for historical lines/graphs.
3. Build match resolver and API-Football candidate-only enrichment.
4. Replace demo dashboard rows with normalized live rows.
5. Run Shadow comparison against Engine 3 before any production activation.

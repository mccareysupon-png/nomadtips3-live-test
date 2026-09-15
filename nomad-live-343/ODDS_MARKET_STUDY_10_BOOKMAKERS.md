# NOMAD LIVE 3.43 — Odds Market Study (10 Major Sportsbooks)

Date: 2026-09-15
Purpose: Permanent display/normalization reference for 3.43 expanded odds UI.
Scope: Soccer pre-match + in-play market structure, not betting advice.

## Sources studied
1. Bet365 — Soccer Rules / Asian Handicap / Goal Line / Asian Corners / Asian Cards / In-Play Asian Markets
2. Pinnacle — Soccer Market Rules / Bet Types / Asian Handicap / Total Markets
3. Betfair — Sportsbook & Exchange football markets / Asian Handicap / corners / cards / in-play market pages
4. 1xBet — Football pre-match and live market categories
5. William Hill — Football handicap / settlement rules
6. Betway — Football odds and in-play market catalogue
7. bwin — Live football and event market pages (Main, Goals, Corners, Cards, Halftime, Handicaps)
8. 888sport — Football, live markets, corners/cards/Asian Handicap, Bet Builder market catalogue
9. DraftKings Sportsbook — Soccer rules, Asian Handicap, corners and cards
10. FanDuel Sportsbook — Soccer house rules, Asian Handicap, totals, corners and cards

## Core conclusion
A complete odds display is not just `market + one number`.
Every quoted item should be modeled with these dimensions whenever available:

`Bookmaker -> Market -> Period -> Stage -> Line -> Selection -> Price`

### Bookmaker
Examples: Bet365, Pinnacle, Crown, 1xBet, 12Bet, William Hill, Betway, bwin, 888sport, etc.

### Market
Examples:
- 1X2 / Match Result
- Asian Handicap
- Goal Total / Goal Line (Over/Under)
- Corner Total
- Corner Asian Handicap
- Cards Total
- Cards Asian Handicap
- Both Teams To Score
- Double Chance
- Draw No Bet
- Correct Score
- Team Totals
- Next Goal
- Player/Team props when feed supplies them

3.43 current bulk Board has verified Bet365 coverage for:
- `1x2`
- `asian_handicap`
- `goal_line`
- `corner_line`
- `corner_asian`
- `asian_handicap_half`
- `goal_line_half`
- `corner_line_half`
- `card_line`
- `card_asian`

## Period is separate from Market
A major sportsbook pattern is to offer the same logical market over different periods:
- Full match / Regular Time
- 1st Half
- 2nd Half
- Extra Time (when specifically offered)
- Short time windows for some books (e.g. 10-minute markets)

Therefore NOMAD must never encode period only as a cosmetic market label. Period must be preserved as a dimension.

## Stage is separate from Period
A market can have multiple price states over its lifetime:
- OPEN — initial pre-match quote
- CLOSE — latest/final pre-match quote before kickoff or market transition
- LIVE / INPLAY / CURRENT — active in-play quote

Do not overwrite OPEN/CLOSE with LIVE. Do not hide historical stages just because the match has started.

## Price anatomy by market

### 1X2
Required when available:
- Home price
- Draw price
- Away price
No `line` is required.

Canonical display:
`H 1.85 | D 3.50 | A 4.20`

### Asian Handicap
A complete quote consists of:
- Handicap line (e.g. -0.25, -0.5, -0.75, -1.0)
- Home-side price
- Away-side price

Canonical display:
`Line -0.50 | H 1.91 | A 1.95`

Important: quarter lines are genuine market values, not formatting noise. Preserve -0.25/-0.75/+0.25/+0.75 exactly.
If feed supplies only the line, display the line and leave side prices blank/—. Never invent prices.

### Goal Total / Goal Line
A complete quote consists of:
- Total line (e.g. 2.5, 2.75, 3.0)
- Over price
- Under price

Canonical display:
`Line 2.75 | O 1.88 | U 1.96`

Quarter totals must be preserved exactly.
If feed supplies only line, do not fabricate O/U prices.

### Corner Total
Same anatomy as Goal Total:
- Corner line
- Over price
- Under price

Canonical display:
`Line 9.5 | O 1.90 | U 1.90`

### Corner Asian Handicap
Same anatomy as Asian Handicap but scoring unit is corners:
- Corner handicap line
- Home price
- Away price

Canonical display:
`Line -1.5 | H 1.92 | A 1.92`

### Cards Total
Same anatomy as Total markets:
- Card line
- Over price
- Under price

Canonical display:
`Line 4.5 | O 1.87 | U 1.97`

Settlement definitions differ by bookmaker, but UI must preserve feed value rather than normalize away source-specific rules.

### Cards Asian Handicap
Same anatomy as Asian Handicap:
- Card handicap line
- Home price
- Away price

### BTTS
- Yes price
- No price
No line normally required.

## Live-market behavior learned across sportsbooks
- Odds are re-priced as score, time and major events change.
- Markets can temporarily suspend and reopen.
- A missing current price does not mean the whole market never existed.
- Pre-match markets may remain historically useful after kickoff.
- First-half markets can be closed after HT while their OPEN/CLOSE values remain valid historical data.
- Corners and cards are first-class live markets on major books, not secondary decorative data.

## UI rules for NOMAD 3.43
1. One renderer owns the Odds DOM. Never allow two renderers to overwrite the same card.
2. Never discard an unknown market merely because it lacks a hard-coded alias. Preserve/discover it dynamically.
3. Support scalar, object, nested object and array shapes.
4. A scalar such as `-0.5`, `2.75`, `9.5` is valid data and must not be treated as empty.
5. Never allow a line-only value to overwrite a richer object containing line + side prices.
6. Display all observed stages. Missing stage = `—`, not hidden market.
7. Keep bookmaker columns even if a bookmaker has no value for a given market. Missing value = `—`.
8. Preserve market + period + stage independently.
9. Use decimal display in NOMAD UI unless user selects another odds format.
10. Never synthesize prices or probabilities not present in the source snapshot.
11. John architecture remains immutable: Bulk request -> snapshot -> Engine Board -> UI. No direct provider or per-fixture request from expanded odds UI.

## Recommended expanded-card hierarchy

### A. Main Match
- 1X2
- Asian Handicap
- Goal O/U

### B. First Half
- 1H Asian Handicap
- 1H Goal O/U
- 1H Corner O/U

### C. Corners
- Corner O/U
- Corner Asian Handicap

### D. Cards
- Cards O/U
- Cards Asian Handicap

Each market is rendered as stage rows:
`OPEN / CLOSE / LIVE`

Desktop matrix:
`Market | Period | Stage | Bet365 | Pinnacle | Crown | ...`

Mobile:
- Market + Period + Stage stay visible
- Select one bookmaker column at a time
- No data loss compared with desktop

## Current 3.43 runtime truth (2026-09-15 audit)
- Engine mode: `BULK_SNAPSHOT_ONLY`
- 200 fixtures observed
- 200 fixtures had `providerOdds.odds`
- Observed Bet365 market keys on real Board: 10 listed above
- Stage shapes include both objects and scalar numbers, plus null when unavailable
- Current bulk Board audit found no separate `providerOdds.bookmakers` rows; therefore other bookmaker columns must remain `—` unless/until they actually arrive in the snapshot

## Permanent incident lessons
- The previous 'only 1X2' symptom was not evidence that upstream had only 1X2. Scalar lines were being lost by the parser.
- Flicker/disappearing odds was caused by more than one odds renderer writing the same expanded card.
- Future changes must be validated against a real Board fixture, not only mocked data.
- CI should fail if any verified Board market disappears from parser output.

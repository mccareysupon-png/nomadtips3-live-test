# NOMAD 3.41 -> 5USD Central Hub Rewire

Status: STEP 01 AUDIT COMPLETE (no production cutover)
Branch: work/nomad341-5usd-central-rewire

## Safety contract
- Keep the 3.41 detector, rolling logic, settings, signal lock, and Asian settlement logic intact unless a later step explicitly requires a narrow adapter change.
- No production source is removed until the replacement path passes shadow comparison.
- Every cutover has an immediate rollback switch.
- 3.43 must consume the same central 5USD snapshot rather than making an independent duplicate live call after centralization.

## Current 3.41 detector inputs
The detector consumes these match-level fields:
- stable match identity
- league, home, away
- live minute
- live score
- cumulative attacks (home/away)
- cumulative dangerous attacks (home/away)
- cumulative shots on target (home/away)
- cumulative shots off target (home/away)
- cumulative corners (home/away)
- possession is carried/displayed but is not a core rolling detector metric today
- repeated snapshots for rolling-window deltas

The live AH market adapter must provide:
- status = AH READY or fail-closed status
- home AH line
- away AH line (or invertible home line)
- home price
- away price
- bookmaker name
- verified bookmaker flag
- source label
- observed/source timestamp usable by the 3.41 freshness gate

Settlement currently requires:
- locked signal match id
- entry score
- selection side
- AH line
- entry odds
- final score

## 5USD central live snapshot availability
The compound live fixture request can supply in one live screen call:
- fixture id
- league/team identity
- kickoff
- status/status code
- minute
- goals/score
- corners
- statistics
  - attacks
  - dangerous_attacks
  - shots_on_target
  - shots_off_target
  - possession
- event timeline
- Bet365 list-odds include

Mapping to 3.41 is complete for every detector metric:
- attacks -> stats.attacks
- dangerous_attacks -> stats.dangerousAttack
- shots_on_target -> stats.shotsOn
- shots_off_target -> stats.shotsOff
- corners -> stats.corners
- possession -> stats.possession

## Central hub normalized contract (planned)
Each snapshot should expose at least:
- fixtureId
- observedAt
- league { id, name }
- home { id, name }
- away { id, name }
- kickoffAt
- status / statusCode
- minute
- score { home, away }
- corners { home, away }
- cards when supplied
- stats { attacks, dangerousAttack, shotsOn, shotsOff, possession }
- events[] (raw normalized 5USD event timeline)
- bet365 bulk/live odds when present
- provenance/provider metadata

The hub owns retrieval/cache/provenance only. It must not run 3.41 or 3.43 prediction logic.

## 10 LIVE AH referee sockets
The 5USD docs currently expose exactly ten non-null LIVE Asian Handicap-capable bookmaker families suitable for the requested 10-judge panel. They line up with existing 3.41 socket positions:

| 3.41 socket | Existing bookmaker identity | 5USD slug | LIVE AH | Planned role |
| --- | --- | --- | --- | --- |
| source5 | 1xBet | 1xbet | yes | judge |
| source6 | Bet365 | bet365 | yes | judge |
| source9 | Macauslot | macauslot | yes | judge |
| source10 | Crown | crown | yes | judge |
| source14 | Easybets | easybets | yes | judge |
| source15 | Vcbet | vcbet | yes | judge |
| source16 | Interwetten | interwetten | yes | judge |
| source18 | 12Bet | 12bet | yes | judge |
| source21 | 18Bet | 18bet | yes | judge |
| source25 | Pinnacle | pinnacle | yes | judge after shadow gate |

Important current behavior: source25 is deliberately excluded from the present consensus. The first shadow phase must preserve this behavior. A later narrow judge-policy step can promote source25/Pinnacle to voting after data validation and simultaneously retire duplicate legacy Pinnacle source26.

Bookmakers present in the old Nowgoal socket table but not suitable as LIVE-AH judges from the current 5USD coverage table must not be forced into the new referee panel (for example books whose AH is pre-match only or absent).

## Request/rate design
- Central live screen: one compound GET /fixtures?status=live&include=odds,events,stats per hub scan.
- Multi-book referee request: one /fixtures/{id}/odds?bookmakers=<10 slugs> request per fixture when the referee panel is actually needed.
- Do not call 10 individual bookmaker requests.
- Do not let 3.41 and 3.43 independently duplicate the central live request after cutover.
- Keep an explicit request budget guard below the account limit and report X-RateLimit state in /health.

## Identity and migration risk
3.41 currently uses the legacy source match id for locked signals and settlement. Replacing the live source with 5USD changes identity to 5USD fixtureId. Therefore:
- no hard ID cutover before a migration rule exists;
- new signals may use 5USD fixtureId only after the adapter/canonical-id gate passes;
- existing pending signals must remain settleable by their old ids until finished, or be stored with an old-id -> 5USD-id bridge captured during shadow mode.

## Event display risk
The current 3.41 event timeline infers SOT/corner from snapshot deltas and goals from observed score changes. 5USD supplies raw event timelines. Do not replace the presentation timeline in the first data cutover. First expose raw events as an additional field, compare them, and switch the UI only after validation.

## Freshness risk
Current 3.41 requires a finite market sourceUpdatedAt and rejects prices older than maximumPriceAgeSeconds. Current 5USD quote responses may not expose a quote-level upstream update timestamp on the ordinary current-odds response. The hub must keep provenance fields distinct:
- observedAt = when the hub received the quote
- lastSeenAt = latest successful retrieval
- priceFingerprint / lastChangedAt = local observation of a line/price change
Do not claim lastChangedAt is an upstream timestamp.

## Step plan / gates

### STEP 02 - Build central hub skeleton (no consumers)
Deliver /health and /live normalized snapshot using one 5USD compound live call. No 3.41/3.43 changes.
Pass gate: schema tests, null-safe parsing, rate-limit telemetry, fail-closed behavior.

### STEP 03 - Central referee endpoint in shadow mode
Add per-fixture cached 10-bookmaker AH endpoint. Normalize all quotes to the 3.41 market shape.
Pass gate: correct bookmaker identity, AH sign, home/away prices, null handling, no duplicated bookmaker vote, request budget.

### STEP 04 - 3.43 becomes first central-hub consumer
Replace only its provider input functions; leave 3.43 detector/settings/signal logic unchanged.
Pass gate: same live fixture coverage and fields, no regression in its board, no direct duplicate live 5USD call.

### STEP 05 - 3.41 live identity/score/stats shadow adapter
Feed central data beside the legacy 3.41 live source without participating in signal decisions.
Pass gate: fixture mapping, minute/score parity, stats parity, rolling snapshot continuity.

### STEP 06 - 3.41 raw events shadow
Expose central raw events without replacing the current inferred event UI.
Pass gate: event ordering, home/away attribution, goal/corner/red-card correctness.

### STEP 07 - 3.41 referee shadow panel
Connect the ten 5USD referee sockets as non-authoritative shadow snapshots.
Pass gate: bookmaker/line/price correctness across live candidate fixtures and freshness telemetry.

### STEP 08 - Referee voting cutover
Switch the authoritative judge source from legacy Nowgoal/TotalCorner referee wiring to validated 5USD sockets. Promote Pinnacle only after the source25 policy change passes tests; remove duplicate legacy Pinnacle vote.
Pass gate: consensus tests, no duplicate votes, fail-closed if < required valid judges, rollback switch proven.

### STEP 09 - 3.41 live-score/stats cutover
Move 3.41 detector input from legacy live pages to the central snapshot; keep detector/evaluate logic unchanged.
Pass gate: rolling-window equivalence, signal shadow comparison, stale-source behavior.

### STEP 10 - Settlement cutover
Settle new 5USD-id signals from central finished fixtures. Drain or bridge old-id pending signals before retiring legacy ended feed.
Pass gate: no orphaned pending signals and Asian settlement results unchanged for identical final scores.

### STEP 11 - UI event cutover
Only after data validation, replace inferred event rendering with central raw events where appropriate; retain fallback if raw events missing.

### STEP 12 - Remove old cables
After a measured stable period and explicit final gate, remove legacy network calls/adapters one family at a time. Keep rollback commit/tag and health alarms.

## STEP 01 result
Success:
- Every core 3.41 live detector input has a direct 5USD field mapping.
- Ten suitable 5USD LIVE-AH bookmakers map cleanly onto ten existing 3.41 bookmaker socket identities.
- 3.43 already proves the compound 5USD live shape is usable for score/stats/events/odds.

Obstacles:
- source25/Pinnacle is currently non-voting in 3.41 consensus.
- current 3.41 match ids are legacy-source ids; settlement migration must be handled deliberately.
- current quote endpoint freshness is observational unless an upstream quote timestamp is available.

Risk level before any cutover: LOW, because no production wiring has been changed in this step.

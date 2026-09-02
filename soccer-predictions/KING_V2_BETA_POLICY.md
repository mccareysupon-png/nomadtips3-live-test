# NOMAD THE KING — KING V2 BETA POLICY

Status: ACTIVE FOR NEW DAILY SCREENING
Locked: 2026-09-03 (Asia/Bangkok)
Owner decision: approved

## 1. Core principle

KING V2 does not select a team merely because it looks stronger or because raw form/H2H is favorable.

The selection question is:

> Does NOMAD have reliable evidence that the market's fair win probability is materially too low for the selected 1X2 side?

If that cannot be demonstrated, return NO PICK.

## 2. Retired logic

The following are retired as primary selection gates for NEW picks:

- legacy ABC pass/fail logic
- legacy uncalibrated Confidence score
- fixed Odds >= 1.80 as a standalone value rule
- raw Last-6 W/D/L count as the main form model
- H2H as a hard gate
- forcing a daily pick count

Historical picks remain unchanged for audit/backtest integrity.

## 3. Approved source stack

Primary match/performance data:
- FotMob / Opta

Cross-check fixtures, tables and match context:
- Soccerway

Longer-horizon statistics when available:
- FBref

Injuries, suspensions and squad context:
- Transfermarkt, cross-checked against FotMob or an official team source when material

Market/price reference:
- OddsPortal and/or Betfair Exchange, with timestamp and market context recorded

Historical backtest data:
- Football-Data.co.uk where competition/season coverage is adequate

WinComparator is no longer the sole or primary decision source. It may be used only as a supplementary reference.

## 4. Competition/data quality gate

Preferred initial competition universe is established, liquid, data-rich senior football competitions.

Reject / NO PICK when any of the following applies:
- Youth / U21 / U23
- reserve competition
- friendly / pre-season
- inadequate xG or equivalent underlying data
- uncertain fixture/team identity
- materially conflicting source data
- thin/unreliable market data
- cup rotation cannot be assessed reliably
- insufficient sample for the required calculations

Data Quality First always beats pick count.

## 5. Performance sample

Do not use six raw results with equal weight as the model.

Preferred structure:
- longer baseline: approximately 15-20 competitive matches when available
- current form window: last 8 overall
- home team: last 8 home
- away team: last 8 away
- newer matches may receive greater weight than older matches

Core underlying variables:
- xG For
- xG Against
- xG Difference
- Shots
- Shots on Target
- Big Chances where available
- non-penalty scoring indicators where available
- home/away split

## 6. Underlying Performance Gate

A selected team should pass at least 3 of the following 4 tests, subject to adequate source quality:

A. Rolling xG Difference edge
- selected side xG Diff advantage >= +0.30 xG per match versus opponent

B. Home/Away xG Difference edge
- selected-side contextual home/away xG Diff advantage >= +0.30

C. Shot-quality edge
- selected side SoT share >= 52%, OR
- selected side has a clearly positive Big Chances balance

D. Defensive quality
- selected side must not have materially worse rolling xGA than the opponent unless the price sufficiently compensates and the reason is documented

## 7. Market baseline

The market is the baseline comparator.

For each 1X2 market:
1. collect Home / Draw / Away odds from reliable sources
2. convert to implied probabilities
3. remove bookmaker margin / overround
4. derive market fair probabilities
5. compare NOMAD model probability with market fair probability

## 8. Value Gate

A new KING pick requires BOTH:

- Model Probability - Market Fair Probability >= +5 percentage points
- Expected Value (EV) >= +5%

EV formula:

EV = (Model Probability x Decimal Odds) - 1

A team being likely to win is not enough. If price does not create positive value, return NO PICK.

## 9. Beta odds range

During KING V2 BETA:

- 1X2 odds > 3.00 => NO PICK

This is a temporary risk-control rule until out-of-sample evidence demonstrates that KING can price longshots reliably.

There is no standalone minimum-odds rule such as the retired >=1.80 gate. Value is determined by fair probability and EV.

## 10. Lineup Gate

Recheck approximately 60-75 minutes before kickoff when confirmed lineup information is available.

Pay special attention to:
- first-choice goalkeeper
- central-defence core
- defensive midfielder
- primary creator
- leading scorer / primary forward
- major set-piece taker

Do not count all absences equally.

If a key absence materially damages the selected side and the market has moved against it, reassess. If the edge no longer passes, NO PICK.

## 11. Market Movement Gate

Record at minimum when practical:
- T-24h price
- T-60m / post-lineup price

If the market moves materially against the selected side, investigate the cause.

Do not treat a longer price automatically as better value.

If the adverse movement cannot be explained or invalidates the model edge, return NO PICK.

## 12. Rest / Rotation Gate

Record rest days and schedule congestion when material.

If the selected team has <=2 rest days while the opponent has >=4 rest days, treat this as a major negative. The pick requires strong counter-evidence; otherwise NO PICK.

## 13. H2H / common opponents

H2H and common opponents remain contextual evidence only.

They may help explain tactical or matchup effects, but:
- are not hard gates
- cannot override poor underlying performance
- cannot override negative EV
- should not be decided from a single old match

The legacy ABC hard gate is retired.

## 14. Final KING Gate

Every published NEW pick must pass:

- DATA QUALITY: PASS
- COMPETITION QUALITY: PASS
- UNDERLYING PERFORMANCE: PASS (normally >=3/4 tests)
- MARKET EDGE: >= +5 percentage points
- EV: >= +5%
- BETA ODDS CAP: <= 3.00
- LINEUP: PASS / no unresolved material damage
- MARKET MOVEMENT: PASS / no unexplained invalidating drift
- REST/ROTATION: PASS

Failure of a hard gate => NO PICK.

## 15. Daily volume

Target output:
- normally 0-2 KING picks per day
- one strong pick is preferable to several marginal picks
- zero picks is valid and should be published as NO KING PICK TODAY

Never create a pick merely to fill the website.

## 16. Confidence calibration

Do not publish a percentage as model Confidence unless it is a calibrated probability.

Calibration must be evaluated out-of-sample using, at minimum:
- Brier Score
- Log Loss
- Calibration curve / reliability bins

A displayed 58% should mean that comparable out-of-sample predictions around 58% win close to that rate over a sufficiently large sample.

## 17. Validation standard

KING V2 must be evaluated with walk-forward / out-of-sample testing.

Track at minimum:
- Win / Loss
- Decimal odds
- Profit/Loss at equal stake
- ROI
- Opening/reference odds
- Closing odds
- CLV
- NOMAD model probability
- market fair probability
- model edge
- EV
- Brier Score
- Log Loss
- league and competition

Do not tune rules on future results or delete losing historical picks.

Target before claiming robust profitability:
- approximately 300 out-of-sample picks, with league-level breakdown and adequate sample quality

## 18. Audit rule

Historical V1 selections/results must remain intact.

KING V2 begins as a new version. Do not rewrite old picks as if V2 had generated them.

Any future material change to thresholds or logic requires an explicit new policy version or dated amendment.

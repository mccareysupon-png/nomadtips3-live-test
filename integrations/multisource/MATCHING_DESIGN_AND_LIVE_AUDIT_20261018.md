# BALL46 fixture identity matching v2 — safer than legacy 3.42 fuzzy lock

Status: **staging pure mapper + read-only real-feed audit; no production mapping or settlement writes.**

## Prior model recovered
`workers/nomadtips3-shot-sidecar-342/src/index.js` matched TotalCorner-side live events to a different provider's matches with Levenshtein/token overlap, separately checked HOME and AWAY, league, optional live score/minute, a minimum candidate score of 0.88 and at least 0.05 lead over the next candidate. This is **documented TotalCorner ↔ 5DollarFootballAPI**, not proof of a historical TotalCorner ↔ Goaloo ID registry. Its in-memory `mappingLocks` were not a durable cross-provider source-of-truth.

## New design for 5USD ↔ Goaloo FT only
1. Canonical 5USD fixture identity captured **during match discovery, before FT**: `fixtureId, home, away, league, kickoffUtc`. Preserve original provider ID and immutable evidence in a durable crosswalk.
2. Pull Goaloo A[] matches **before FT** and register `Goaloo match id` in the same crosswalk. Goaloo FT evidence arrives later and uses the stored ID, never a new name-only live lookup.
3. Normalize diacritics/punctuation, standard FC suffixes, `Utd → United`; use fuzzy score to propose candidates, but **do not remove gender, U21/U19 or reserve indicators**. HOME and AWAY must match in order.
4. Hard gates for automatic proposal: verified Goaloo source UTC conversion, UTC kickoff difference ≤15 minutes, each name similarity ≥0.88, combined identity score ≥0.92, same normalized league or an explicitly *approved* league alias. Require mutual best among both providers and ≥0.06 lead over alternatives. IDs must be unique and nonblank within the entire batch. This score is an algorithm parameter, **not a statistically validated accuracy probability**.
5. If league names differ, learning mode suggests reviewable aliases from **≥2 distinct strong, uniquely paired games**, but never auto-activates them. Conflicting country, swapped sides, missing timezone, youth/women classification differences, repeated fixtures, or ambiguous rivals → HOLD. Any independently verified source ID association takes precedence over fuzzy scores after persistence.
6. No Corners used. Do not require Goaloo corners. Its regulation-time FT score can only settle compatible goal markets through the existing Engine settlement owner.
7. Persist the approved mapping using a durable **one-to-one unique reverse index** `5usdFixtureId ↔ sourceFixtureId`, original evidence timestamps, approval source, policy version and conflicts. Writer must be **the current Production Ledger V2 integration**, not the historical Engine v5 signals array.
8. Compare output to independently checked games and previously unpaired fixtures. Target is zero **observed wrong accepted pairs**, but **100% accuracy/coverage cannot be claimed** until an independently labeled live/historical validation set and hosted end-to-end result settlement are completed.

## Real read-only audit (2026-10-18, Bangkok morning)
[GitHub Actions 39083107885](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39083107885):
- Goaloo feed: **752** fixture rows; 5USD Hub: **1,443** fixture rows.
- **101 tentative exact-normalized HOME/AWAY name pairs** with unique 5USD candidate.
- Provisional raw kickoff offset comparison (Goaloo wall clock *temporarily interpreted as if UTC*, **NOT timezone-certified**): **95** exact-minute matches, 2 at minus 2 minutes, 1 at plus 5 minutes, 3 at plus 10 minutes.
- **70 of 101 pairs have differing league labels**. This is why unapproved leagues cannot be silently bypassed.
- Common real examples for human review: Goaloo `USL Championship` vs 5USD `USA USL Championship` (7 games); `USL League One` vs `USA USL League One` (4); `USA Major League Soccer` vs `USA MLS` (4). `Sweden Div 3 Mellersta` vs `Sweden 2.div Västra Götaland` (3) may represent genuinely different competitions; never merge solely from similar kickoff/team names.
- **Zero production mappings or SETTLED** from this audit.

## Implementation and isolated checks
- `integrations/multisource/cross-source-fixture-mapper.mjs`: strict source-neutral matcher with one-to-one mutual best, score gap, duplicate poisoning, kickoff and country checks, youth/women safety and timezone certification gate.
- `integrations/multisource/league-alias-suggestions.mjs`: review-only evidence-driven alias candidate generation; no automatic approval.
- `integrations/multisource/test/`: **24/24 tests passing** in [Actions 39082918941](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39082918941).
- `integrations/multisource/read-only-live-identity-audit.mjs`: independent source GET-only comparisons; time offsets are observations, not source timezone certification.

## Release
No Production deployment. PR #362 contains an **older Engine wrapper that does not include all active Production Ledger V2 and early-OVER behavior**; do not merge it to production. Port only the verified crosswalk and result-evidence handoff into the currently running source owner / isolated Sidecar after exact Ledger V2 parity, source licensing and hosted Worker/Durable Object tests.

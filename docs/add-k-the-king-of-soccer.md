# Add K The King of Soccer — V1

Status: TEST ONLY  
Preset key: `ADD_K_THE_KING_OF_SOCCER_V1`

## Purpose

A fixed one-click Ball Teng preset for users who do not want to edit selection rules themselves.

The preset follows one ordering principle:

**Data Quality First → Analysis → Pick**

A run is allowed to return zero selections. The engine must never keep an older set in a way that makes it look like Add K selected those matches in the new run.

## One-click run contract

- Button label: `ใช้เงื่อนไข “Add K The King of Soccer”`
- One click creates a new Active Version and is one explicit reselection command.
- Repeated runs are not quota-limited by this preset.
- The button is disabled only while the request is being submitted, to prevent overlapping double-clicks.
- Add K rules are fixed in the Worker and are not editable from the page.
- Running Add K changes the active runtime config but preserves the user's Custom Draft.
- Missing data are never invented.

## Locked V1 thresholds

| Rule | V1 |
| --- | ---: |
| Main market | 1X2 Team Win |
| Minimum confidence | 62% |
| Maximum confidence | 85% |
| Minimum main odds | 1.70 |
| Overall sample | 6 matches |
| Home/Away sample | 5 matches |
| Minimum usable sample | 5 matches |
| Minimum strength | 0.62 |
| Minimum Overall PPG edge | 0.30 |
| Minimum Home/Away PPG edge | 0.40 |
| Maximum fixtures to analyze | 240 |
| Maximum selections | 0 = unlimited qualifying selections |
| League standings | Required |
| Minimum league-table size | 8 teams |

## Strength model

Core screening:

- Overall PPG weight: 34%
- Home/Away PPG weight: 36%
- Goal Difference weight: 18%
- Legacy unranked Common Opponent: 0% (retired)

Ranked standings context is an adjustment layer, not a flat addition to the core percentages:

- Ranked Standing strength weight: 32%
- Adjustment cap: ±32%
- Direct A-vs-B rank mix: 55%
- Ranked shared-opponent C mix: 45%

## Strict data-quality gate

Reject a candidate when any required condition fails, including:

- incomplete fixture/team identity;
- inadequate recent or venue-specific match sample;
- league standings unavailable;
- league table smaller than 8 teams;
- adjusted strength below the V1 threshold;
- confidence below 62%;
- real 1X2 odds unavailable or below 1.70.

The engine may publish `NO PICK` when no fixture survives screening or when later confidence/data-quality checks remove all candidates.

## V1 scope and transparency

V1 uses only signals that the current Ball Teng selector/backend actually retrieves and evaluates. It must not fabricate xG, lineup, injury, suspension, tactical, or other unsupported inputs.

Those factors can be added in a later engine version only after they are connected to a reliable data source, normalized, tested, and included transparently in the scoring/quality pipeline.

## Versioning

Do not silently alter V1 thresholds. Material changes should create a new preset version (for example `ADD_K_THE_KING_OF_SOCCER_V2`) so historical runs remain interpretable.

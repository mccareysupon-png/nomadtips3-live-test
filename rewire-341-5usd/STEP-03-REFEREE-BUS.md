# STEP 03 — 5USD 10-Referee Bus (Shadow Only)

## Status

Implementation target: shared `nomadtips3-5usd-central-hub` Worker on branch `work/nomad341-5usd-central-rewire`.

Production state remains unchanged. No NOMAD 3.41 or 3.43 consumer is connected in this step.

## Provider facts verified 2026-09-13

Current 5DollarFootballAPI docs state:

- non-Bet365 bookmaker access requires Ultra or an eligible equivalent plan;
- Ultra account limit is 40 requests/minute;
- `GET /v1/fixtures/{id}/odds` accepts a comma-separated `bookmakers=` list;
- Asian Handicap returns in-play line plus HOME/AWAY prices where recorded;
- compound fixture requests with `include=` have `per_page` capped at 50.

## Socket map

The 10 selected LIVE-AH-capable books map to existing 3.41 positions:

1. source5 / position 5 / 1xBet / `1xbet`
2. source6 / position 6 / Bet365 / `bet365`
3. source9 / position 9 / Macauslot / `macauslot`
4. source10 / position 10 / Crown / `crown`
5. source14 / position 14 / Easybets / `easybets`
6. source15 / position 15 / Vcbet / `vcbet`
7. source16 / position 16 / Interwetten / `interwetten`
8. source18 / position 18 / 12Bet / `12bet`
9. source21 / position 21 / 18Bet / `18bet`
10. source25 / position 25 / Pinnacle / `pinnacle`

## Shadow contract

Every returned referee is forced to:

- `shadowOnly: true`
- `voteEligible: false`
- never create or select a signal
- fail closed when bookmaker or in-play AH is missing

No change is made to 3.41's `PRICE_SOURCE_REGISTRY` or consensus policy in this step.

## Upstream call shape

For one fixture refresh the Hub calls all 10 books together:

`GET /v1/fixtures/{fixtureId}/odds?market=asian&bookmakers=1xbet,bet365,macauslot,crown,easybets,vcbet,interwetten,12bet,18bet,pinnacle`

This is one upstream request per fixture refresh, not ten.

## Cache

- live compound cache: 55 seconds
- referee cache: 55 seconds per fixture
- duplicate concurrent calls for the same fixture share one in-flight refresh

## Timestamp safety

Provider fixture odds does not need to expose a native quote timestamp for this shadow contract.
The Hub records:

- `observedAt`: Hub receipt time
- `lastChangedAt`: first Hub observation time of the current line/HOME/AWAY price fingerprint
- `sourceUpdatedAt`: `null`

`observedAt` and `lastChangedAt` are not bookmaker-native quote timestamps and cannot be passed into 3.41 freshness logic as if they were native source update times.

## STEP 02 correction discovered during STEP 03

Provider documentation caps compound `include=` responses at `per_page=50`.
The Hub skeleton previously used `per_page=500`.
STEP 03 corrects this to 50 and adds pagination with fixture-id deduplication before any deployment or consumer connection.

## Remaining gates

- CI syntax + contract tests.
- Branch-vs-main isolation diff.
- Isolated real-provider probe later, before any consumer migration.
- Rate-budget review while 3.43 still makes direct 5USD requests.
- Native/derived freshness policy before any 3.41 referee receives voting rights.

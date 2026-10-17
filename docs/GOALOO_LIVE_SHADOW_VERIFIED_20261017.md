# BALL46 × Goaloo — LIVE READ-ONLY SHADOW VERIFIED (2026-10-17)

**Decision:** GO for further *read-only* engineering, NO-GO for production settlement/deployment. Two independent real-feed Github Actions runs completed.

## GitHub Actions evidence
1. [Run 39037021504](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39037021504) at 13:33–13:34 UTC: Goaloo parsed 746 rows first pass; second reachable, 26 pending signals, 5 provisional signal matches (3 distinct fixture IDs), 2 matched provisional Goaloo FT scores stable across 2 reads.
2. [Run 39037270817](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39037270817) at 13:36–13:37 UTC: Goaloo 739 rows on both reads, 174 FT first pass; Hub and Engine and Ball46 main `/api/engine/statistics?paged=1&limit=1` returned HTTP 200 JSON. Engine direct `/statistics` produced over-2MB response and was not parsed by the **test limit**; it is not proof of endpoint outage.
3. Second run: 27 PENDING signal records, 18 distinct fixture IDs, 488 live Hub fixtures; 4 distinct candidate cross-provider matches with exact HOME+AWAY name strings; 2 in-play candidates each show Goaloo raw kickoff `2026-10-17 12:00:00` and Hub UTC kickoff `2026-10-17T12:00:00+00:00` (possible UTC offset zero; 2 examples are NOT sufficient to certify source timezone).
4. Two FT-stable candidate matches (still PENDING on Engine): Ball46 `201654042` -> Goaloo `3019157` scored `2-0`; Ball46 `202917416` -> Goaloo `3102155` scored `1-3`. Both are **HOLD** because their fixture IDs were absent from the current live Hub `/snapshot`; no independently verified Ball46 kickoff UTC or persisted Goaloo mapping was available.
5. Zero cross-provider candidates meet the release gate. Zero production writes or deploys.

## Diagnosis
The immediate obstacle is **persistent match-identity history**, not Goaloo feed availability. The Hub's current snapshot may omit already-finished matches. A fallback that only searches the currently live Hub cannot safely recover these; it needs original match metadata from the locked engine signal/selection history or another durable fixture registry. Never infer source identity from matching team names only.

## Required next read-only step
Investigate a trustworthy historical fixture record keyed by the **Ball46** `fixtureId` with canonical HOME/AWAY, league, provider fixture ID and `kickoffUtc`, preferably from the original signal's immutable selection snapshot. Compare with the independently fetched Goaloo row in a persistent mapping audit. Require explicit status `FT`, two identical observations 60s apart, league+time+teams, rejection on conflicts. Only then consider existing settlement owner handoff; never patch statistics or Member1. Confirm provider terms/rights before any commercial live integration.

## Scope/protection
Workflow exists **only** on `prep/goaloo-final-result-20261017` and runs on manual dispatch or changes to this exact workflow in the preparation branch. It uses public GET requests and no secrets, auth tokens, database bindings, deploy command or POST. Member1, Engine343 and HUB343 were not modified.

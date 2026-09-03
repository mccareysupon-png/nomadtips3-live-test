# NOMAD — NOWGOAL DISASTER FALLBACK

Status: SCOUT / STANDBY ONLY
Date: 2026-09-03
Branch: work/nowgoal-disaster-fallback-scout-20260903

## Trigger
Use this plan only if TotalCorner is blocked/unavailable at system level and normal repair/fallback paths are not viable.

## Objective
Promote Nowgoal from price/reference source to disaster source for the public first page while preserving NOMAD's existing UI contract and isolating the replacement from the rest of the system.

## Existing proven assets
Current `nomad-live-engine/src/nowgoal.js` already contains:
- live roster polling and match-id extraction
- home/away team mapping
- match state
- live score
- team-variant safety checks
- score compatibility checks
- confidence-based match mapping
- Full Match Live AH normalization
- verified change-time handling
- multiple bookmaker feeds

Current bookmaker map includes 20 Nowgoal bookmaker channels. Core proven channels are:
- 1xBet — companyId 50 / source5
- Bet365 — companyId 8 / source6
- M88 — companyId 17 / source7

Additional referee candidates already mapped include Pinnacle, Sbobet, 12Bet, 188BET, BWin, William Hill and others.

## Disaster architecture

Nowgoal
  -> Session / roster inlet
  -> Match normalizer
  -> NOMAD fixture identity
  -> Page-1 public feed adapter
  -> UI

In parallel:

Nowgoal bookmaker feeds
  -> bookmaker normalizer
  -> price freshness / change-time gate
  -> referee selector
  -> Page-1 odds/referee output

The public page must never consume raw Nowgoal structures directly.

## Page-1 minimum contract
The first cutover version should require only fields that are already proven or can be safely normalized:
- match id
- league/competition where available
- home
- away
- kickoff/date
- live state/status
- live score
- source observed time
- mapping confidence
- source freshness
- referee bookmaker
- AH line
- home odds
- away odds
- referee price timestamp

Unknown fields must be null/UNAVAILABLE rather than inferred.

## Statistics / event expansion
Current Nowgoal adapter proves roster/state/score and price feeds, but the repository does not yet prove a complete Page-3-grade statistics/event contract (attacks, dangerous attacks, SOT, shot off, corners, event timeline).

Therefore:
1. Do not claim those fields are available until live endpoints are independently verified.
2. Scout them as separate sub-lines.
3. Normalize each sub-line independently.
4. Failure of one statistic must not blank the match card.
5. Never fabricate or derive an unavailable statistic from odds.

## Referee strategy
Preferred disaster order:
1. Bet365 (existing core Nowgoal channel)
2. Pinnacle if fresh and match mapping passes
3. M88
4. 1xBet
5. Remaining configured Nowgoal bookmakers only if freshness + mapping gates pass

Do not publish a referee price unless:
- fixture mapping passes
- market is Full Match Live AH
- line is normalized to NOMAD home-handicap convention
- price change/observation time is valid
- price age is inside configured maximum

## Load protection
Do not reproduce the suspected TotalCorner burst pattern.
- one shared Nowgoal session per scan window
- cache roster separately from bookmaker feeds
- stagger bookmaker requests
- cap concurrent requests
- use jitter between refreshes
- retain last-good snapshot during short upstream failure
- exponential backoff on repeated errors
- never fan out 20 bookmaker requests at the exact same instant unless an existing batched source already provides them

## Cutover levels
LEVEL 0 — Normal
- TotalCorner primary
- Nowgoal referee/price role only

LEVEL 1 — Degraded
- TotalCorner partial
- keep last-good TotalCorner public data
- Nowgoal fills only proven missing price/referee fields

LEVEL 2 — Disaster Page-1 Cutover
- TotalCorner fully unavailable/blocked
- Nowgoal becomes Page-1 fixture/state/score source
- Nowgoal becomes referee-price source
- unsupported stats remain unavailable

LEVEL 3 — Extended Disaster
- only after separate live verification of Nowgoal statistic/event endpoints
- attach verified stats/event sub-lines through adapters
- Page 3 remains isolated until its contract tests pass

## Safety gates before activation
- shadow feed only first
- compare match count and team mapping against current public feed
- reject ambiguous Women/Uxx/Reserve mappings
- reject score mismatch
- require mapping confidence threshold
- test stale handling
- test no-source behavior
- test bookmaker freshness
- test UI with missing optional statistics
- activation must be reversible with one source selector / config change

## Rollback
This branch is documentation/scout only and must not alter current runtime. Rollback target is current `main` at the branch creation point. Production activation requires a separate explicit cutover change.

## Current decision
Prepare, do not activate. If TotalCorner is globally blocked, use this document as the starting cutover runbook and build a dedicated Nowgoal Page-1 adapter rather than modifying the existing TotalCorner parser in place.

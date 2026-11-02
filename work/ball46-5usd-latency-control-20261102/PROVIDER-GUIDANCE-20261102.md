# 5USD response supplied by owner — analysis for BALL46

Source: owner-pasted email from John Ellis / 5DollarFootballAPI, displayed at 19:21. The email is evidence supplied in the conversation; its figures describe that measurement, not a new BALL46 benchmark. Public documentation checked: https://5dollarfootballapi.com/docs#rate-limits and https://5dollarfootballapi.com/docs/status .

## What it establishes

- John reports Bulk and individual fixture endpoints read the same live tables without a response-cache advantage for individual endpoints. Retain Bulk; do not add per-match score polling.
- The reported median 1s / P95 3s measures age since ingestion updated a match. It does not measure goal-on-field to API delivery, or API to BALL46 display. Their upstream registration delay is not measured.
- Their 160/164 events within two match minutes is a minute-resolution upper bound for that probe, not a typical delay in seconds and not proof that BALL46 is faster/slower than Goaloo by two minutes.
- No supplier side-by-side comparison with Flashscore, Sofascore, AiScore or Goaloo was performed.

## Polling arithmetic: one Live Bulk page

| Interval | Expected added polling wait | Maximum polling wait in the fixed-cadence model | Live requests/min |
| --- | --- | --- | --- |
| 30s | 15s | 30s | 2 |
| 15s | 7.5s | 15s | 4 |
| 10s | 5s | 10s | 6 |

The half-interval model assumes events arrive uniformly between successful fixed-cadence polls. It excludes upstream registration, network failures/backoff, pagination and BALL46 publication/browser stages. 30→15 saves an expected 7.5s at HUB polling only; 15→10 saves another 2.5s. No claim that either fixes a two-minute end-to-end delay is supported.

John recommends testing15s first,10s only for push/goal alerts, and not below10s. Future normal product profiles should therefore be DEFAULT30 / LIVE15 / ALERT10. Retire2/3/6s from normal operating recommendations; the old MAX experiments do not constitute Production authorization.

## BALL46-specific implications

The supplier's2/4/6 requests/min figures concern Live Bulk only. They do not budget Today/Schedule, Full Market, Engine, Form History, sidecars or legacy jobs. Read-only Cloudflare inventory found78 Workers,18 with5USD key bindings and6 with Cron; bindings/Cron alone do not prove actual outgoing requests or ownership of a specific key. Owner confirmed there are no users of the account outside BALL46 on Cloudflare. Keep acceleration locked until actual account consumption and reservation coverage are established.

For the next performance phase, measure the separate stages: supplier event observation → existing cached HUB snapshot → published Board → browser display. Investigate serving score/minute from the existing fresh HUB snapshot rather than waiting for an Engine scan, while preserving fixture identity, freshness checks and Signal/Settlement logic. This is a proposal, not a change in this release, and introduces no requirement for additional provider endpoints.

## Validation plan

1. Record20–30 matched goal changes on one permitted reference site and BALL46 using the same observer clock; include fixture ID, old/new score, first-observed reference time, HUB first-observed time and browser first-observed time. Keep observation uncertainty/polling granularity explicit.
2. Report median/P95 for matched differences and for HUB→browser delay, with sample size. Do not substitute match minute or snapshot age for real event delivery time.
3. Test score correction2→1 and disappearance of the withdrawn goal event. Display the latest confirmed feed, including downward corrections; do not treat a lower score as automatically invalid. Do not alter Ledger or Signal formulas to accommodate a UI change.
4. Respect429 Retry-After across producer paths; do not retry immediately. Treat any402 using its actual response details; the supplier email does not identify402 as a quota error.

## Current approved release remains unchanged

Owner selected: publish owner controls only, retain30s, hard-lock every accelerated preset in both UI and server. Opening/selecting does not write a setting. Saving the same30s is a no-op with no alarm/producer call. No Engine/Full Market/Member/Stripe/key/Cron change is authorized by this email.

Release attempt41447947391 stopped before any traffic writes: Cloudflare10021 rejected secret_text metadata without a text value. The correction is documented inherit binding type with literal latest, strict resolution and a guard that the latest uploaded secret source is the active Production version. No secret is retrieved, printed, recreated or rotated. Reference: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/ .

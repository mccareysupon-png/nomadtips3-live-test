# Ball46 Member v1

Isolated member application for Ball46.

## Safety boundary

- Worker name: `ball46-member-production`
- This directory does not modify `ball46-production`.
- No route or link is added to the public Ball46 site in this branch.
- No production Engine, Statistics, EventFlow, Match Status, Leagues, Odds or Bookmaker asset is imported or overwritten.
- Member pages are `noindex` until the owner explicitly orders the public link.

## V1 pages

- `/pricing` — one-plan membership explanation and Stripe checkout entry point.
- `/login` — reserved login surface.
- `/member` — Daily Signal Center.
- `/success` — payment-return surface.

## V1 data model

The UI is designed around a read-only daily mirror:

```
Ball46 Production Signal Output
          |
          v
Member Daily Mirror
          |
          v
ball46-member-production
```

The member page never recalculates signals. It only reads the daily mirror.

Daily feed order: newest first.

Markets:
- ALL
- AH
- 1X2
- O/U
- CORNERS
- BTTS
- CARDS
- OTHER

Daily-only metrics:
- Signals
- WIN
- LOSS
- PUSH
- HALF WIN
- HALF LOSS
- PENDING
- Win Rate
- Profit/Loss

At the Ball46 daily cutoff, the Member Daily Mirror and its daily counters reset. Historical statistics remain the responsibility of the main Ball46 site.

## Current stage

This branch is an isolated UI/data-contract scaffold. The demo identity is JAY / MEMBER ACTIVE and sample daily signals are supplied by the member worker API.

Stripe endpoint scaffolding is present but intentionally refuses live checkout until Stripe secrets and a Price ID are configured. Entitlement storage/authentication is not faked client-side.

## Later, only after owner approval

1. Configure Stripe secrets/Price ID.
2. Add verified entitlement/auth flow.
3. Wire the real Daily Mirror.
4. Deploy the isolated Member worker.
5. QA desktop/mobile.
6. Only then add the single Ball46 Member entry card/link to the main Ball46 production.

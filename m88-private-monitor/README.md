# M88 Private Monitor

Private, read-only sports monitor for the owner workflow. It is intentionally isolated from NOMADTIPS3 Production and CAR 3.5 public pages.

## Scope

Three pages only:

1. `Detection` — reads the M88 public sports universe and evaluates local conditions.
2. `Statistics` — stores timestamped signal snapshots and keeps detected score separate from FT score.
3. `Conditions` — owner-configurable minute, odds, score, market, league, scan interval and signal-limit filters.

The project does **not** log in to M88, place bets, enter stakes, confirm transactions or automate an account session.

## Feed discovery

M88 MSports is a JavaScript web app. The Worker provides:

- `GET /api/source/probe`
- `GET /api/source/probe?deep=1`

The deep probe fetches the public MSports HTML, extracts script bundles and scans them for likely public sports/event/market/odds endpoints. Once the correct JSON endpoint is verified, configure it as the Worker variable/secret `M88_FEED_URL`.

`GET /api/feed` then fetches that endpoint and applies a generic match normalizer. The raw source object is retained with every detected signal for later auditing.

## Cloudflare

`wrangler.jsonc` deploys the Worker with static assets from `web/`.

Recommended production secrets/vars:

- `PRIVATE_TOKEN` — optional but strongly recommended; locks both UI and `/api/*`.
- `M88_FEED_URL` — exact verified public JSON feed endpoint.
- `M88_PUBLIC_APP_URL` — defaults to `https://msports.m88.com/app/v2/`.

## Safety boundary

Keep this project on its own Worker/hostname. Do not merge its routes into the main CAR 3.5 Production Worker until the source mapping and result settlement are independently verified.

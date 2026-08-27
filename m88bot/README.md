# NOMAD M88 BOT Control Room

`m88bot/` is a private-operations control-room surface for NOMAD Live 3.42.

Target route after a later production-routing step:

`https://www.nomadtips3.com/m88bot`

## Purpose

Keep the project flow obvious to both the operator and future development work:

`TotalCorner -> NOMAD 3.42 -> M88 price judge -> Final Judge -> Signal Lock -> D1 -> Statistics / History / Health`

## Current state

- Git only on `work/nomad342-central-ledger`.
- No production route is configured by this folder.
- No Cloudflare deployment is performed by this folder.
- The existing NOMAD 3.42 engine is not modified.
- The existing NOMAD 3.41 engine/web directories are not modified.
- The page is read-only and performs GET probes only.
- M88 remains a browser-local price judge; this page does not log in to M88 or execute wagers.
- Central D1 is shown as `NOT PROVISIONED` until real infrastructure is created and verified.
- `noindex,nofollow` is present in the page head.

## Read-only probes

The control room uses the same current 3.42 TEST Worker host already referenced by the 3.42 frontend and reads:

- `GET /health`
- `GET /feed`

No secrets or write tokens belong in this static directory.

## Future cutover gate

Routing `/m88bot*` on the production domain is a separate operation. Before that step:

1. Review this control room in Git.
2. Provision and test any required 3.42 backend persistence separately.
3. Protect the future route for private use.
4. Verify the dedicated route does not alter the existing 3.41 production route.
5. Only then connect `www.nomadtips3.com/m88bot`.

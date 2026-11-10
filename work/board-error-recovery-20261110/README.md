# Website board read recovery — TEST ONLY

This patch replaces only `engineBoardResponse` in the exact current Website Worker main module. It changes no Engine service code, Signal formula, ledger, settlement, Member, UI, Favorites, refresh interval, bindings or Cron. It introduces no wrapper, new runtime module, provider call or retry loop.

Engine fetch exceptions and malformed JSON now produce a controlled `503` unless an existing fresh cache-only HUB snapshot can recover the response. HUB failures preserve the usable original Engine response or its original HTTP error. New error bodies contain codes only; exception messages/stacks are not published.

Fallback requires `ok=true`, a fixtures array, `cacheOnly=true`, `externalRequestsAdded=0`, `stale=false`, and valid timestamp/age fields. HUB freshness classification is authoritative; timestamps, fixture data, odds and freshness flags are copied without relabeling. This also prevents the existing HTTP-error fallback from presenting a stale/unknown HUB snapshot as successful recovery.

Run: `node work/board-error-recovery-20261110/test.mjs` (24 controlled cases, no network). `verify-current.mjs` reads the actual current Cloudflare version and prepares a syntax-checked main with exact inverse-diff verification. It makes GET requests only and uploads no Worker version.

Deploy is not part of this change. Before any activation, re-read actual active Production, compare all modules/configuration, test the uploaded Preview with real PC/mobile data and the existing Favorites gates, and retain the immediate current version as rollback. Do not combine this patch with Favorites without explicit review of both changes. The historical 599 exception trigger remains unproven; these tests establish recovery behavior, not an end-to-end guarantee against every possible 599.

# Consented presence release — 21 October 2026

Status: activated and verified in Production on 21 October 2026. Owner explicitly authorized the Zaraz/main-public-page heartbeat scope after reviewing the local consent screenshot. See STATE-20261020.md for current versions, live consent/deduplication/withdrawal checks and verification logs.

## Data and meaning

- Online: distinct consenting browser IDs with a server-received heartbeat in the last120 seconds. Browser sends about every45 seconds only while visible and active within30 minutes. This is browser presence, not proof of a person looking at the screen.
- Unique24h: distinct consenting browser IDs active in the last24 hours. ID expires after30 days, is scoped to each main hostname, and does not identify a human across devices/hosts.
- Sessions24h: distinct session IDs active in the last24 hours; the browser rotates the session after30 minutes without page activity. Existing Cloudflare Visits/Pageviews/IP request samples stay separate.
- Counts start with the first accepted event; no historical reconstruction. Disabled, unconfigured, never-connected, failed and incomplete scans return null/Not connected. A previously connected idle source can legitimately show0.
- Cloudflare KV is eventually consistent: changes can take60 seconds or longer across locations; Admin polls the presence endpoint every30 seconds. This limitation is displayed.

## Privacy review

- Explicit affirmative opt-in before creating analytics IDs or sending heartbeat. Equal accept/reject buttons; site remains usable without consent. Choice storage only before opt-in.
- DNT/GPC respected. Withdraw stops future heartbeat, removes local IDs, requests deletion and records a26-hour hashed revocation marker to suppress in-flight events. KV deletion propagation may lag; failed delivery still expires at26 hours.
- Only approved public main paths. Exact main origins on the server; Member, account, checkout, login, API and unlisted paths are excluded. No query, fragment, referrer, input values, button details, session replay or fingerprints.
- KV stores hashed random IDs plus server time; browser records additionally contain public path, country and Mobile/Desktop. All personal measurement keys expire26 hours after their latest event. First-connection marker contains only a server timestamp.
- No real or masked IP in measurement storage/logs. A hashed network identifier is used only for short-lived rate-limit counters; no IP-to-browser join. Existing IP request samples remain private on the Admin source and are never stored in KV.
- Public Collector has no report-read API or Analytics credentials. Admin keeps RS256 Access owner verification for both summary and presence.
- Full disclosure is served from Collector /privacy and linked directly in the consent banner. Main privacy/cookie pages and main Worker source remain unchanged.

## Activation boundary and rollback

1. Run45 privacy/counting/regression tests, generated-asset equality check, syntax checks and read-only baseline. Confirm Workers/KV plan and available quota; never upgrade a plan silently.
2. Snapshot current active/latest Admin and Collector versions, all bindings/settings/schedules, owner Access app/policy hash, domains, and main Worker active/detail hash. Stop on drift from the reviewed versions.
3. Prepare exact Admin source modules including presence.mjs; preserve both encrypted Analytics secrets by inheritance from latest and retain the dedicated KV. Change only COLLECT_ENABLED from false to true after readiness.
4. Prepare Collector modules collector.mjs, presence.mjs, tracker-assets.mjs only; preserve its existing dedicated KV/settings and add isolated rate-limit bindings. Collector owns no private report capability. Turn collection on only after the consent/privacy implementation passes.
5. Deploy only the two named Monitor Workers. Preserve ball46-production and every Member/football Worker, Access policy, domains, routes and cron. Never replay the earlier IP-only activation workflow.
6. Before publishing Zaraz, export its currently disabled configuration. Create a configuration rule that disables Zaraz except the exact main hosts and approved public paths, ensuring Member receives no loader. Configure one Custom HTML tool to load the consent script; disable advanced Zaraz monitoring and unneeded compatibility, query/referrer/UA/IP forwarding. The script itself gates all measurement on opt-in; it contains no other analytics/advertising tool.
7. Enable/publish only the reviewed Zaraz scope. Verify no-loader Member/private-path behavior, fresh visitor no heartbeat before consent, accept produces real event, Dashboard counts/expiry, deny/revoke stop events, desktop/mobile usability, and anonymous Admin denial. Preserve main version before/after.
8. Rollback: first disable the new Zaraz tool/configuration (restoring its exported baseline), then restore prior Collector/Admin deployments by version at100%. No old source upload, no KV purge, no main deployment. Re-check owner Access, binding inventory, collector disabled and main version.

## Quota and scale limits

Two KV writes per accepted heartbeat plus first-connection/revocation metadata; a continuously active browser can cause roughly3840 KV writes/day at45 seconds. Existing KV quota/plan must support this before activation. Per-browser and generous per-network rate limits protect writes; Cloudflare enforces those counters per location, not as a global billing cap. Each report scans at most30 pages per prefix and fails closed on overflow. Larger traffic requires a separate storage/aggregation review, not silently truncated totals.

Sources: https://developers.cloudflare.com/kv/concepts/how-kv-works/ ; https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ ; https://developers.cloudflare.com/zaraz/advanced/load-selectively/

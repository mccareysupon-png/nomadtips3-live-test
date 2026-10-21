# Existing request IP data: collection boundary review

This change reads the Cloudflare Security Analytics `httpRequestsAdaptive` dataset already visible to the owner. It does not activate the Visitor Monitor Collector or install a tracker, cookie, heartbeat, fingerprint, session ID or new logging hook on BALL46.

- Scope: only ball46.com and www.ball46.com; requestSource=eyeball. Member subdomains are excluded.
- Display: up to100 most recent sampled requests from the last24h, ending three minutes before the query. The interface labels sampling, bots and automated/API requests explicitly.
- Fields: existing client IP, country, timestamp, host, sanitized path, device category, browser category and HTTP status. No request query, headers, bodies, referrer URLs or session hashes are requested. Sensitive account/login/reset paths are replaced with [private path].
- Access: the existing owner-only Cloudflare Access app and Worker JWT validation protect the page and API. Production reuses the existing API read secret encrypted inside the same Admin Worker, without changing its permissions. The owner separately approved a temporary Zone Analytics Read token for predeployment testing; its value was used only in memory and it expires on22 October2026 at07:00 Asia/Bangkok, within24h of creation.
- Retention: raw request records are not written to KV, databases, source, GitHub artifacts or application logs. The response uses no-store and the browser replaces the table on refresh. Source retention and sampling remain controlled by Cloudflare's existing dataset.
- Purpose: owner inspection of incoming website requests. IPs and sampled records must not be used as counts of unique people, sessions or currently online users.
- Deployment boundary: only b46-visitor-monitor-admin code changes. Main Worker, routes, Collector, Access policy, bindings and football/member databases remain unchanged.

This technical review does not activate a consent-based session tracker. True live presence, human-level unique visitors and sessions remain unconnected because no supporting source exists within the currently approved no-main-site-change scope. Any future tracker requires its own privacy/consent decision and explicit permission to change that boundary.

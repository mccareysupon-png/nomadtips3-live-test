# BALL46 owner API control V2

Approved phase: isolated owner page, real cached HUB reads, server-side owner authentication and DEFAULT 30s confirmation. All accelerated rates remain locked. This phase does not claim that changing to 15/10s works.

Local visual preview: http://127.0.0.1:8824/ . Production target (availability must be verified): https://ball46-owner-control-v2.mccarey-supon.workers.dev/ . Access allows only the existing owner identity. No provider API key is present in this Worker or browser.

`prepare.mjs` creates the authenticated page and JWT verifier from the preserved base. `connected-client.js` reads `/api/settings`, keeps failed/unknown metrics unavailable, disables Save when state is stale and requires explicit Save. The admin gateway authenticates the owner and reads only the original HUB `/health` route through its existing service binding. DEFAULT compares the control revision and confirms unchanged 30s without touching producer control routes, storage or alarms. Other rates are denied before producer access.

Current publishing uses `diagnose.mjs` with `OWNER_PUBLISH_PHASE=true` and `publish-workflow.yml`. It replaces only the admin Worker's authentication and gateway modules, preserves its other modules/bindings, and verifies current versions, source hashes, settings and Cron of all four protected services. It has a hard write allowlist for the admin Worker only. No HUB or Website upload, deployment or configuration change is allowed. Failure restores the captured admin version and disables its workers.dev address. The older `release.mjs` is superseded for this phase and must not be retriggered.

Validation: `node prepare.mjs`, `node gateway.test.mjs` (27 cases); CI runs `browser-check.mjs` on 1366px and 390px with isolated local fixtures, then publishes the isolated admin only. Fixtures do not contact Production or the provider. A successful CI result still requires an owner browser check and manual DEFAULT confirmation before claiming the page is usable.

JWT compatibility fix: Cloudflare Workers rejects fetch redirect mode `error`. The JWKS fetch uses `manual`, accepts only successful responses, and rejects redirects without following them. Issuer, audience, owner email, expiry, key ID and RSA signature checks remain mandatory. Reason codes contain no JWT or key values.

No Engine, Full Market, Member, Stripe, provider key, frequency or Cron changes are part of this release. Provider 429/account quota telemetry is not invented: fields remain unavailable until a separate authorized integration can provide complete account evidence.

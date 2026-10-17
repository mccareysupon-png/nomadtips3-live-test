# BALL46 Member Sandbox — connection and activation runbook

Target worker: `ball46-member-sandbox` (NOT `ball46-member-production`)
Target branch: `test/ball46-member-stripe-sandbox-20261017`
Test Stripe price: `price_1URU2jFXmKSSVxQd98cwIgDY` ($5 USD monthly, livemode=false).
Checkout flag remains **false** until successful sandbox-only end-to-end verification.

## 1. Cloudflare Zero Trust
- Add a **separate** Access application protecting the sandbox worker hostname `ball46-member-sandbox.mccarey-supon.workers.dev`.
- Require email one-time PIN or an approved identity provider for `/member*`, `/api/member/*` including checkout, match, daily, stripe-readiness.
- Confirm that Access injects a signed `Cf-Access-Jwt-Assertion` to the Worker.
- Store `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as sandbox-only Worker variables or secrets. NEVER copy production identifiers without verifying this app's audience.
- Test unauthenticated requests yield 401 or Access sign-in (not premium content).

## 2. Stripe TEST credential
- From the Stripe dashboard in Test/Sandbox mode, generate a restricted API key granting only access needed to create Checkout Sessions and read customers/subscriptions. Never use a `sk_live_` or `rk_live_` key.
- Store credential as **sandbox-only** Worker secret `STRIPE_SECRET_KEY` through Cloudflare Dashboard: Workers & Pages > ball46-member-sandbox > Settings > Variables and Secrets > Add > Secret. Never put its value in GitHub, wrangler configs, logs or this chat.
- Verify sandbox `STRIPE_PRICE_ID` resolves to recurring monthly USD 500 and belongs to `BALL46 MEMBER`.
- Double-check no production host redirects occur.

## 3. Gate and end-to-end checks
- Existing `MEMBER_CHECKOUT_ENABLED=false` is deliberate. The health and denial smoke test must pass first.
- Sign in as a **non-owner** test identity and validate JWT + plan lookup via server; check that missing/revoked identity is refused.
- In an isolated test-deploy only, switch checkout flag true after all secrets and Access rules are ready; leave production unchanged.
- Checkout using Stripe test card (no real card), verify resulting test subscription is active and price matches exactly.
- Return to sandbox `/member`; verify authorized access. Remove/cancel test entitlement and verify it is revoked after expiry. Verify `past_due` and wrong-price subscriptions remain denied.
- Re-test production remains unchanged; only then consider launch readiness.

## Caution
The currently deployed sandbox checkout may remain unavailable, because both `MEMBER_CHECKOUT_ENABLED=false` and absent sandbox credentials intentionally fail closed. Do not test using the owner email: owner bypass is independent of Stripe billing and would mask payment failures.

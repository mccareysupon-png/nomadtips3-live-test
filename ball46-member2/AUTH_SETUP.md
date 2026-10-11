# Ball46 Member: production sign-in prerequisites

The server-side authorization implementation is present but **fails closed** until the deployment is configured. Do not enable Stripe Checkout until all end-to-end QA passes.

## Cloudflare Access

1. Create a Cloudflare Zero Trust Access application covering `https://member.ball46.com/member*` and the private API paths `/api/member/daily*`, `/api/member/match*`, `/api/member/session*` (the session endpoint can remain publicly callable because the Worker itself verifies the JWT).
2. Configure a verified identity provider or one-time-password email login. Access policy alone does **not** grant a subscription.
3. On **ball46-member-production**, set:
   - `CF_ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`
   - `CF_ACCESS_AUD` = the exact Access application's audience tag
   - `STRIPE_SECRET_KEY` = secret for the correct Stripe account and mode
   - `STRIPE_PRICE_ID` = the specific paid member plan Price ID
4. The Worker validates Access's RS256 JWT with Cloudflare public keys, validates issuer/audience/expiration/signature, then looks up active or trialing Stripe subscriptions tied to the *verified Access email* and configured Price ID.
5. Never put secret values in GitHub or the public frontend. Worker secrets and Access application configuration must be applied securely in Cloudflare.
6. Test with a valid paid customer, an unpaid email, a cancelled/expired customer, forged JWT, private browser, another device and after token expiry. Missing configuration, Stripe timeout and any token failure must deny access.

## Current safety boundary

- `/member`, `/member.html`, `/api/member/daily`, `/api/member/match`: protected, deny unauthenticated requests (401).
- `/api/member/session`: gives session status only, never fabricates the former demo OWNER identity.
- `/api/stripe/checkout`: intentionally disabled (503).
- `/api/stripe/webhook`: not configured (503).
- Public Pricing, Login and Success pages can remain accessible; the Success page is never proof of paid status.
- The `ball46-production` Worker is untouched.

## Before opening checkout

Implement secure checkout creation, verified signed Stripe webhook with replay safety, persistent entitlement reconciliation and a complete two-device QA run; verify the ability to recover access and support existing payers. Then separately authorize live payment collection.

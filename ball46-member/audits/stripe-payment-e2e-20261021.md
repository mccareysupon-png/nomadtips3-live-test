# BALL46 Member — Stripe Payment E2E Audit (2026-10-21)

**Scope:** Read/test only. No live charges, no production code changes, no production deployments. Test Mode writes were limited to a fictitious customer, a Checkout Session and one $5 test subscription, which has been canceled.

## PASS — Actual Stripe Test Mode API
- Stripe account: Nomadtips3 (testmode, not live).
- Monthly test price: `price_1URU2jFXmKSSVxQd98cwIgDY`, USD 5.00.
- Test customer: `cus_VTwYDJOomS7h8A` (fictitious `example.com` address).
- Hosted test Checkout Session `cs_test_a14jYICcHvwJJk7Ze8PB9TiWD0AmKYmYcgDQ4HBdsm9b20qgSOLaIW25G0` was **completed using Stripe's 4242 test card in Chromium**, with Stripe API readback `status=complete`, `payment_status=paid`, `livemode=false`, `amount_total=500`. Browser returned to `https://member.ball46.com/success?session_id=...`. [Browser proof](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39603502317).
- Two independent paid Stripe Test Mode flows were verified: (1) a direct test-card subscription API payment and (2) the actual Stripe-hosted Checkout payment in Chromium.
- Stripe Test Mode Subscription `sub_1USyiUFXmKSSVxQdEOjIAT1A` reached **active**.
- Invoice `in_1USyiUFXmKSSVxQdGJAxW17C` had `status=paid`, `amount_paid=500`, `currency=usd`, `livemode=false`.
- Direct API test subscription canceled immediately with `invoice_now=false`, `prorate=false`; readback `status=canceled`. Hosted Checkout also generated `sub_1USz3aFXmKSSVxQdawWkfQfr` with status `active` and paid invoice `in_1USz3YFXmKSSVxQd0dQwqFvG` (`amount_paid=500`, USD, `livemode=false`), then was canceled. Stripe readback shows **zero active subscriptions** for the fictitious test customer.
- **No real money was charged.** The paid test invoice remains in Stripe Test Mode as evidence.

## PASS — Worker authorization logic and public production gates
- GitHub Actions [signed JWT / Stripe mocked-API integration suite](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39601373224): **85 tests PASS / 0 FAIL**.
- Tests include real local RSA signatures with a synthetic JWKS, matching active price, owner lifetime, unauthorized identity, tampered JWT, incorrect plan, inactive, canceled, unpaid, past-due and expired subscriptions, protected HTML/API and checkout gating.
- For these **application tests**, Stripe API responses were mocked. Do **not** describe them as a paid member logging in through actual Cloudflare Access.
- Live, unauthenticated requests were checked: `/api/health=200`, enrollment flag `true`, `/member.html=302` to login, `/api/member/session=302` and `/api/member/daily=302` (Cloudflare Access), `/api/stripe/webhook=503`. No anonymous access to premium content was observed.
- Independent Cloudflare Worker [live configuration audit](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39602525346): **PASS**, active Member Worker `6ba427b5-579a-4cc4-928d-2b32f393daba`, with all required bindings present, Stripe API key stored as a secret, enrollment enabled, billing protection functions present.
- CF API masks the actual `STRIPE_PRICE_ID` binding value, including in Worker version metadata. Confirmed binding *exists*, but **cannot verify live price value** from read-only API; `UNKNOWN`, not a mismatch. [Live Worker runtime audit](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39602525346) confirms all required binding names, secret storage of the Stripe API key, checkout flag on, and runtime handlers.

## UNKNOWN — Unperformed actual customer-facing step
- A non-owner customer has **not** completed the live `member.ball46.com` login → hosted **LIVE** Checkout payment with a real card → returned to website → opened Signal Center while logged in.
- **Hosted Test Checkout was completed successfully in the browser** and returned to the site's success page. A hosted **Live** Checkout has not been completed with a real card or a real customer identity.
- There are no observed Live subscriptions for the configured BALL46 live recurring price `price_1UOGIkFXmKSSVxQdhVjI9ml6` at the time checked.
- Do not state that the entire real-money end-to-end process is 100% verified until a genuine authorized purchase is made and member entitlement tested. The Stripe-hosted TEST Checkout and redirect are now independently verified.

## FAIL / Outstanding product capability
- Deployed Worker explicitly responds `503 WEBHOOK_NOT_CONFIGURED` to `/api/stripe/webhook`. The system relies on signed Access identity and per-request Stripe API subscription status, so the absence of a Webhook is **not by itself proof activation is broken**.
- Deployed Worker does **not** expose `/api/member/billing-portal` or `/api/member/manage-billing`, and Stripe reports **0 billing portal configurations** for this account. A verified self-service plan-management/cancellation path was not found. Before broadly selling recurring subscriptions, implement or clearly document a customer-accessible cancellation process; do not cancel live customers as part of testing.
- Internal registration/payment notification flow and web/browser UX under an authenticated real customer remain untested.

## Safety / Next action
- Do not use the site owner's Lifetime access as the billing test customer; it bypasses paid subscription validation.
- For true full-chain confirmation, use a separate, authorized non-owner customer and real card to make **one $5 Live** test purchase; verify receipt, protected Member access, correct plan/renewal, then cancel *the test subscription* using an approved safe cancellation method. This final step requires a genuine payer's authorization and payment method and was **not performed**.
- Never put a live API key or card information in GitHub commits/logs.

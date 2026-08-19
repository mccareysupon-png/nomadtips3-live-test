# nomadtips3 Line alerts membership

This service is deliberately isolated from the internal detector. It reads locked signal history and manages Line delivery entitlements only.

## Public flow

1. User adds the nomadtips3 Line Official Account.
2. User sends `JOIN`.
3. The Line webhook returns an 8-character pairing code valid for 24 hours.
4. User opens the Stripe $30/month subscription checkout and enters the pairing code in the required field.
5. Stripe sends signed subscription events to the membership worker.
6. Active Stripe subscription = Line alerts ACTIVE. Failed/canceled subscription pauses alerts.
7. The membership worker polls locked signal history every minute and sends only newly locked signals.

The first poll initializes the seen-signal baseline and does not send historical alerts.

## Owner / test bypass

The owner does not need a Stripe subscription. After `OWNER_PAIR_SECRET` is configured, send:

`OWNER <private-owner-pair-secret>`

from the owner Line account. The webhook stores that Line user ID as `OWNER / ACTIVE` and it remains exempt from Stripe entitlement changes.

`STATUS` shows the current Line entitlement state.

## Public endpoints

- Health: `https://nomadtips3-car34-line-alerts.mccarey-supon.workers.dev/health`
- Line webhook: `https://nomadtips3-car34-line-alerts.mccarey-supon.workers.dev/line/webhook`
- Stripe webhook: `https://nomadtips3-car34-line-alerts.mccarey-supon.workers.dev/stripe/webhook`
- Payment redirect: `https://nomadtips3-car34-line-alerts.mccarey-supon.workers.dev/payment`

## Required private secrets

Never commit these values to the repository. Configure them as GitHub Actions repository secrets (the deploy workflow copies them into Cloudflare Worker secrets) or set them directly as Cloudflare Worker secrets:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `STRIPE_WEBHOOK_SECRET`
- `OWNER_PAIR_SECRET`
- `OWNER_ADMIN_TOKEN` (only for private `/admin/test` and `/admin/poll` endpoints)

The public subscription page keeps checkout disabled until the first three delivery/payment secrets are present.

## Line Developers Console

Set the Messaging API webhook URL to:

`https://nomadtips3-car34-line-alerts.mccarey-supon.workers.dev/line/webhook`

Enable webhooks. The worker verifies `x-line-signature` with HMAC-SHA256 before processing any user ID or command.

## Stripe

Live product and recurring price are managed in Stripe. The Payment Link requires the custom field `Line pairing code`.

The Stripe webhook endpoint must send:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The worker verifies the `Stripe-Signature` header before changing entitlement state.

## Test

After secrets are configured and the owner is enrolled, call the private endpoint with `X-Admin-Token`:

`POST /admin/test`

It sends one test Line alert to every active OWNER account.
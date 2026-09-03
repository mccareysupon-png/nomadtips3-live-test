# NOMADTIPS3 Telegram Alerts — Step 2 Signal Bridge

Status: **TEST WORKER / SIGNAL BRIDGE IMPLEMENTED / PAYMENT STILL DEFERRED**

This package continues the verified Telegram Core from 2026-09-02 on the same TEST Worker and D1 database. Step 2 connects locked NOMAD signals to Telegram delivery without changing NOMAD detection logic, public pages, Stripe/payment logic, or the legacy LINE system.

## Step 1 preserved

- TEST Worker: `nomadtips3-telegram-alerts-test`
- Webhook: `POST /telegram/webhook`
- `/start`, `/status`, `/help`
- Admin TEST ALERT: `POST /admin/test`
- Admin webhook setup: `POST /admin/set-webhook`
- D1 tables: `telegram_subscribers`, `telegram_deliveries`, `telegram_updates`
- New registration: `PENDING_PAYMENT`, `active=0`
- Price: **$3/month**
- No `/start` command can activate paid delivery.

## Step 2 Signal Bridge

Signal source:

`https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev/history?page=1&limit=25`

Flow:

1. Worker polls the locked-signal history every minute.
2. Only records with `selectedAt` or compatible `lockedAt` are eligible.
3. The first successful poll is a **BASELINE ONLY**. Existing historical signals are recorded but never sent.
4. Every later locked signal receives a stable SHA-256 key.
5. `telegram_signal_ledger` prevents reprocessing the same signal.
6. Existing `telegram_deliveries` adds a per-recipient duplicate key: `SIGNAL:<signal-key>:<chat-id>`.
7. Real Signal delivery requires **both** `status='ACTIVE'` **and** `active=1`.
8. `PENDING_PAYMENT`, `active=0`, paused, or canceled subscribers cannot receive a real Signal.
9. Delivery result is recorded as `SENT`, `FAILED`, `DELIVERED`, `PARTIAL`, or `NO_ACTIVE_RECIPIENTS` as appropriate.

Step 2 adds:

- `GET /bridge/status`
- Admin-only `POST /admin/poll`
- Cloudflare scheduled poll every minute
- D1 `telegram_signal_ledger`
- D1 `telegram_signal_runtime`
- Signal normalization and Telegram message formatting
- Two-attempt Telegram send path for transient send failures

## Safety contract

- No payment code is added in Step 2.
- No subscriber is auto-activated.
- `PENDING_PAYMENT` remains blocked from real live-signal delivery.
- First deployment cannot flood old historical alerts because the first poll is baseline-only.
- Telegram bot token, webhook secret, and admin token remain Cloudflare Worker secrets and are never committed.
- NOMAD detector/source is read-only from this service.
- Existing LINE membership code is untouched.

## Worker secrets

These remain the same as Step 1:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ADMIN_TOKEN`
- optional `TELEGRAM_TEST_CHAT_ID`

Admin routes use header `X-NOMAD-ADMIN-TOKEN`.
Telegram webhook verification uses `X-Telegram-Bot-Api-Secret-Token`.

## CI

From `telegram-alerts/worker`:

```bash
npm run check
npm test
```

CI verifies both the original Step 1 safety contract and the Step 2 Signal Bridge contract, including the `ACTIVE + active=1` entitlement gate, baseline protection, duplicate ledger, locked history source, and secret scan.

## Step 1 live checkpoint — 2026-09-02

- TEST Worker deployment: PASS
- Worker secret bindings: PASS
- Telegram webhook registration: PASS
- `/start`: PASS — subscriber created `PENDING_PAYMENT`, `active=0`
- `/status`: PASS — `PENDING_PAYMENT / NOT ACTIVE`
- TEST alert: PASS
- Delivery ledger: PASS
- Duplicate Telegram update guard: PASS

## Step 2 checkpoint — 2026-09-03

Code/CI scope:

- Same TEST Worker contract preserved
- NOMAD locked-signal source connected
- First-poll baseline guard implemented
- SHA-256 signal duplicate guard implemented
- Existing subscriber table reused; no duplicate membership database
- Real delivery gate fixed at `status='ACTIVE' AND active=1`
- `PENDING_PAYMENT` remains blocked
- Scheduled every-minute polling configured
- `/bridge/status` and `/admin/poll` implemented

Live deployment verification is completed separately on the TEST Worker before Step 2 is marked fully live.

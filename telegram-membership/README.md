# NOMADTIPS3 Telegram Alerts — Step 2 Signal Bridge

Status: **STEP 2 implementation / safety-first test path**

This package connects the NOMADTIPS3 locked-signal history to Telegram membership delivery without changing the legacy LINE membership code.

## Fixed membership rule

- Plan: **$3/month**
- New Telegram registrations start as **PENDING_PAYMENT**.
- Only `ACTIVE` members are eligible for real live-signal delivery.
- `PENDING_PAYMENT`, `PAST_DUE`, and `CANCELED` members never receive real live-signal delivery.
- Payment activation itself is intentionally outside Step 2.

## Signal path

1. The bridge polls the configured NOMAD source every minute.
2. It reads `GET /history?page=1&limit=25` and accepts only records with a locked/selected timestamp (`selectedAt`, with compatible locked aliases).
3. The first successful poll creates a **baseline only**; it does not send historical signals.
4. Every later new signal receives a stable SHA-256 signal key.
5. D1 `telegram_signal_ledger` claims each signal before delivery.
6. D1 `telegram_signal_deliveries` adds a `(signal_key, chat_id)` primary-key duplicate guard.
7. The bridge loads only `ACTIVE` Telegram members and sends the alert through Telegram Bot API.
8. Delivery success/failure is recorded in D1 and exposed by bridge status.

## Safety / isolation

- Existing NOMAD detector logic is read-only from this service.
- Existing legacy LINE membership files are not modified.
- No Telegram bot token or webhook secret is committed.
- No historical signal is sent when the bridge starts.
- No real alert is sent to a member whose status is `PENDING_PAYMENT`.

## Worker routes

- `GET /health`
- `GET /bridge/status`
- `POST /telegram/webhook`
- `POST /admin/test` — requires `X-Admin-Token`
- `POST /admin/poll` — requires `X-Admin-Token`

Telegram webhook calls must contain Telegram's `X-Telegram-Bot-Api-Secret-Token` header matching the worker secret.

## Required Worker secrets

Configure these directly in Cloudflare Worker secrets; never commit them:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_ADMIN_TOKEN`

## D1

The isolated Step 2 tables are created automatically if missing:

- `telegram_members`
- `telegram_signal_ledger`
- `telegram_signal_deliveries`
- `telegram_runtime`

The worker currently binds the existing test D1 database `nomadtips3-paper-db`; all Step 2 tables use the `telegram_` prefix and do not overwrite NOMAD engine tables.

## NOMAD source

Default source:

`https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev`

Override with `NOMAD_SIGNAL_SOURCE_URL` without changing bridge code.

## CI

From `telegram-membership/worker`:

```bash
npm test
```

Tests cover locked-record normalization, stable duplicate keys, membership entitlement guard, and Telegram signal formatting.

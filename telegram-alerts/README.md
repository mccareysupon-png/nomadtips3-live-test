# NOMADTIPS3 Telegram Alerts — Step 1 Core

Status: **TEST ONLY / NOT CONNECTED TO STRIPE / NOT CONNECTED TO NOMAD SIGNALS**

This directory is an isolated Telegram delivery service. Step 1 deliberately does not modify NOMAD 3.41/3.42 detection, public pages, Stripe, LINE, or member settings.

## Step 1 scope

- Cloudflare Worker dedicated to Telegram alerts.
- Telegram webhook endpoint: `POST /telegram/webhook`.
- Webhook verification with Telegram `secret_token` header.
- D1 subscriber table with default state `PENDING_PAYMENT` and `active=0`.
- D1 update ledger to ignore duplicate webhook updates.
- D1 delivery ledger for TEST/SENT/FAILED records.
- Admin-only test alert endpoint: `POST /admin/test`.
- Admin-only webhook setup endpoint: `POST /admin/set-webhook`.
- Health endpoint: `GET /health`.

No `/start` command can activate paid delivery in Step 1. `/start` only records the Telegram chat as `PENDING_PAYMENT`. Payment entitlement is a later phase.

## Private Worker secrets

Never commit these values:

- `TELEGRAM_BOT_TOKEN` — from BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — 1–256 chars using A-Z, a-z, 0-9, `_`, `-`.
- `TELEGRAM_ADMIN_TOKEN` — protects admin endpoints.
- `TELEGRAM_TEST_CHAT_ID` — optional; lets `/admin/test` omit `chatId`.

Example setup from `telegram-alerts/worker`:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_ADMIN_TOKEN
npx wrangler secret put TELEGRAM_TEST_CHAT_ID
```

## Safe test sequence

1. Configure the three required secrets; `TELEGRAM_TEST_CHAT_ID` is optional.
2. Deploy the TEST Worker.
3. Check `/health` and confirm DB/bot/webhook/admin are configured.
4. Call `POST /admin/set-webhook` with header `X-NOMAD-ADMIN-TOKEN`.
5. Open the bot in Telegram and send `/start`.
6. Send `/status`; it must report `PENDING_PAYMENT / NOT ACTIVE`.
7. Call `POST /admin/test`; verify one TEST ALERT is received and a delivery row is recorded.

## Isolation / rollback

Rollback for Step 1 is simply disabling or deleting `nomadtips3-telegram-alerts-test`. No NOMAD engine route or public page is changed. The new D1 tables are namespace-isolated by the `telegram_` prefix and are not read by existing NOMAD code.

## Checkpoint

- Base: `main` at the start of Step 1 on 2026-09-02.
- Branch: `feature/telegram-alerts-step1-20260902`.
- Completed in code: Telegram Worker core, webhook security, pending subscriber registration, duplicate-update guard, delivery ledger, admin test-send route, health route.
- Completed live verification: TEST Worker deployment, Worker secret bindings, webhook registration, real Telegram `/start` and `/status`, TEST alert, delivery ledger, and duplicate-update guard.
- Not completed / explicitly deferred: Stripe $3, Signal Bridge, retries, and paid entitlement.
- Next step after Step 1 live verification: **Step 2 — Signal Bridge**.

## STEP 1 LIVE CHECKPOINT

- Date: 2026-09-02
- TEST Worker URL: `https://nomadtips3-telegram-alerts-test.mccarey-supon.workers.dev`
- Health: PASS (`db`, `botToken`, `webhookSecret`, `adminToken`, and `publicWebhookUrl` configured)
- Webhook: PASS (`setWebhook` confirmed by Telegram)
- `/start`: PASS (subscriber created as `PENDING_PAYMENT`, `active=0`)
- `/status`: PASS (`PENDING_PAYMENT` / `NOT ACTIVE`)
- Test alert: PASS (received in Telegram)
- Delivery ledger: PASS (`event_type=TEST`, `status=SENT`)
- Duplicate guard: PASS (replayed update returned `duplicate=true`; no duplicate processing)
- `TELEGRAM_TEST_CHAT_ID`: not set; the test used the admin request body `chatId` directly.
- No secrets are recorded in this checkpoint or repository.


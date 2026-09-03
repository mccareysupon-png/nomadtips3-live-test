import { isEligibleMember, normalizeSignal, signalKey, signalMessage } from './signal-bridge-core.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-admin-token,x-telegram-bot-api-secret-token'
};

const DEFAULT_SOURCE = 'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
const SIGNAL_LIMIT = 25;
const CLAIM_LEASE_MS = 2 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 2;
let schemaReady = false;

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
const clean = value => String(value ?? '').trim();
const now = () => Date.now();
const nowIso = () => new Date().toISOString();

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS telegram_members (
    chat_id TEXT PRIMARY KEY,
    telegram_user_id TEXT,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    plan_usd REAL NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_members_status ON telegram_members(status)`,
  `CREATE TABLE IF NOT EXISTS telegram_signal_ledger (
    signal_key TEXT PRIMARY KEY,
    selected_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'NOMAD',
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DISCOVERED',
    first_seen_at INTEGER NOT NULL,
    claimed_at INTEGER,
    delivered_at INTEGER,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_signal_status ON telegram_signal_ledger(status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS telegram_signal_deliveries (
    signal_key TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    delivered_at INTEGER,
    last_error TEXT,
    PRIMARY KEY(signal_key, chat_id)
  )`,
  `CREATE TABLE IF NOT EXISTS telegram_runtime (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL
  )`
];

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map(statement => env.DB.prepare(statement)));
  schemaReady = true;
}

async function runtimeGet(env, key) {
  const row = await env.DB.prepare('SELECT value FROM telegram_runtime WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

async function runtimeSet(env, key, value) {
  await env.DB.prepare(`
    INSERT INTO telegram_runtime(key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, String(value ?? ''), now()).run();
}

async function upsertPendingMember(env, message = {}) {
  const chatId = clean(message?.chat?.id);
  if (!chatId) return null;
  const userId = clean(message?.from?.id);
  const username = clean(message?.from?.username);
  const stamp = now();
  await env.DB.prepare(`
    INSERT INTO telegram_members(chat_id, telegram_user_id, username, role, status, plan_usd, created_at, updated_at)
    VALUES (?, ?, ?, 'MEMBER', 'PENDING_PAYMENT', 3, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      telegram_user_id = COALESCE(NULLIF(excluded.telegram_user_id, ''), telegram_members.telegram_user_id),
      username = COALESCE(NULLIF(excluded.username, ''), telegram_members.username),
      updated_at = excluded.updated_at
  `).bind(chatId, userId, username, stamp, stamp).run();
  return env.DB.prepare('SELECT * FROM telegram_members WHERE chat_id = ?').bind(chatId).first();
}

async function memberByChat(env, chatId) {
  return env.DB.prepare('SELECT * FROM telegram_members WHERE chat_id = ?').bind(String(chatId)).first();
}

async function activeMembers(env) {
  const result = await env.DB.prepare("SELECT * FROM telegram_members WHERE status = 'ACTIVE' ORDER BY created_at ASC").all();
  return (result.results || []).filter(isEligibleMember);
}

function statusText(member) {
  const state = clean(member?.status || 'PENDING_PAYMENT').toUpperCase();
  if (state === 'ACTIVE') return 'ACTIVE · Telegram live alerts enabled.';
  if (state === 'PAST_DUE') return 'PAST DUE · Telegram live alerts paused.';
  if (state === 'CANCELED') return 'CANCELED · Telegram live alerts disabled.';
  return 'PENDING PAYMENT · $3/month · Live alerts are not enabled yet.';
}

async function telegramApi(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok !== false) return body;
      lastError = new Error(`TELEGRAM_${response.status}:${clean(body?.description).slice(0, 180)}`);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('TELEGRAM_SEND_FAILED');
}

const sendMessage = (env, chatId, text) => telegramApi(env, 'sendMessage', {
  chat_id: String(chatId),
  text: String(text).slice(0, 3900),
  disable_web_page_preview: true
});

function adminOk(request, env) {
  const expected = clean(env.OWNER_ADMIN_TOKEN);
  const supplied = clean(request.headers.get('x-admin-token'));
  return Boolean(expected && supplied && expected === supplied);
}

function telegramWebhookOk(request, env) {
  const expected = clean(env.TELEGRAM_WEBHOOK_SECRET);
  const supplied = clean(request.headers.get('x-telegram-bot-api-secret-token'));
  return Boolean(expected && supplied && expected === supplied);
}

async function handleTelegramWebhook(request, env) {
  if (!telegramWebhookOk(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  const update = await request.json().catch(() => ({}));
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return json({ ok: true, ignored: true });

  const member = await upsertPendingMember(env, message);
  const chatId = clean(message.chat.id);
  const command = clean(message.text).split(/\s+/)[0].toLowerCase();

  if (['/start', 'start', 'join'].includes(command)) {
    await sendMessage(env, chatId, [
      'NOMADTIPS3 Telegram Alerts',
      'Registration received.',
      statusText(member),
      'Use /status to check your membership.'
    ].join('\n'));
  } else if (command === '/status' || command === 'status') {
    await sendMessage(env, chatId, `NOMADTIPS3 · ${statusText(member)}`);
  }
  return json({ ok: true });
}

async function fetchLockedSignals(env) {
  const base = clean(env.NOMAD_SIGNAL_SOURCE_URL || DEFAULT_SOURCE).replace(/\/$/, '');
  const response = await fetch(`${base}/history?page=1&limit=${SIGNAL_LIMIT}`, {
    headers: { accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!response.ok) throw new Error(`NOMAD_HISTORY_${response.status}`);
  const payload = await response.json();
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const normalized = records.map(normalizeSignal).filter(Boolean);
  normalized.sort((a, b) => Date.parse(a.selectedAt) - Date.parse(b.selectedAt));
  return normalized;
}

async function rememberSignal(env, signal, status = 'DISCOVERED') {
  const key = await signalKey(signal);
  if (!key) return { key: '', inserted: false };
  const stamp = now();
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO telegram_signal_ledger
      (signal_key, selected_at, source, payload_json, status, first_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(key, signal.selectedAt, signal.source || 'NOMAD', JSON.stringify(signal.raw || signal), status, stamp, stamp).run();
  return { key, inserted: Number(result?.meta?.changes || 0) > 0 };
}

async function initializeBaseline(env, signals) {
  let inserted = 0;
  for (const signal of signals) {
    const remembered = await rememberSignal(env, signal, 'BASELINE');
    if (remembered.inserted) inserted += 1;
  }
  await runtimeSet(env, 'bridge_initialized', '1');
  await runtimeSet(env, 'last_poll_at', nowIso());
  await runtimeSet(env, 'last_poll_result', `BASELINE:${inserted}`);
  return { initializedNow: true, baseline: inserted, discovered: 0, delivered: 0 };
}

async function resetExpiredClaims(env) {
  const cutoff = now() - CLAIM_LEASE_MS;
  await env.DB.prepare(`
    UPDATE telegram_signal_ledger
    SET status = 'PARTIAL', claimed_at = NULL, updated_at = ?
    WHERE status = 'CLAIMED' AND claimed_at IS NOT NULL AND claimed_at < ?
  `).bind(now(), cutoff).run();
}

async function claimSignal(env, key) {
  const stamp = now();
  const result = await env.DB.prepare(`
    UPDATE telegram_signal_ledger
    SET status = 'CLAIMED', claimed_at = ?, updated_at = ?
    WHERE signal_key = ? AND status IN ('DISCOVERED', 'PARTIAL')
  `).bind(stamp, stamp, key).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function deliveryRow(env, key, chatId) {
  return env.DB.prepare('SELECT * FROM telegram_signal_deliveries WHERE signal_key = ? AND chat_id = ?')
    .bind(key, String(chatId)).first();
}

async function deliverToMember(env, key, member, message) {
  const chatId = String(member.chat_id);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO telegram_signal_deliveries(signal_key, chat_id, status, attempt_count)
    VALUES (?, ?, 'PENDING', 0)
  `).bind(key, chatId).run();

  const current = await deliveryRow(env, key, chatId);
  if (current?.status === 'DELIVERED') return { ok: true, duplicate: true };
  if (Number(current?.attempt_count || 0) >= MAX_DELIVERY_ATTEMPTS && current?.status === 'FAILED') {
    return { ok: false, exhausted: true, error: current.last_error || 'DELIVERY_ATTEMPTS_EXHAUSTED' };
  }

  const attempt = Number(current?.attempt_count || 0) + 1;
  await env.DB.prepare(`
    UPDATE telegram_signal_deliveries
    SET status = 'SENDING', attempt_count = ?, last_attempt_at = ?, last_error = NULL
    WHERE signal_key = ? AND chat_id = ?
  `).bind(attempt, now(), key, chatId).run();

  try {
    await sendMessage(env, chatId, message);
    const deliveredAt = now();
    await env.DB.prepare(`
      UPDATE telegram_signal_deliveries
      SET status = 'DELIVERED', delivered_at = ?, last_error = NULL
      WHERE signal_key = ? AND chat_id = ?
    `).bind(deliveredAt, key, chatId).run();
    return { ok: true };
  } catch (error) {
    const text = clean(error?.message || error).slice(0, 500);
    await env.DB.prepare(`
      UPDATE telegram_signal_deliveries
      SET status = 'FAILED', last_error = ?
      WHERE signal_key = ? AND chat_id = ?
    `).bind(text, key, chatId).run();
    return { ok: false, error: text };
  }
}

async function processSignal(env, row, recipients) {
  if (!await claimSignal(env, row.signal_key)) return { delivered: 0, skipped: true };

  if (!recipients.length) {
    await env.DB.prepare(`
      UPDATE telegram_signal_ledger
      SET status = 'NO_ACTIVE_RECIPIENTS', claimed_at = NULL, updated_at = ?
      WHERE signal_key = ?
    `).bind(now(), row.signal_key).run();
    return { delivered: 0, noRecipients: true };
  }

  let signal;
  try { signal = normalizeSignal(JSON.parse(row.payload_json || '{}')); } catch { signal = null; }
  const message = signalMessage(signal || { selectedAt: row.selected_at, source: row.source });
  let delivered = 0;
  let failed = 0;
  let lastError = null;

  for (const member of recipients) {
    const result = await deliverToMember(env, row.signal_key, member, message);
    if (result.ok) delivered += result.duplicate ? 0 : 1;
    else {
      failed += 1;
      lastError = result.error || 'DELIVERY_FAILED';
    }
  }

  const status = failed ? 'PARTIAL' : 'DELIVERED';
  const deliveredAt = failed ? null : now();
  await env.DB.prepare(`
    UPDATE telegram_signal_ledger
    SET status = ?, claimed_at = NULL, delivered_at = COALESCE(?, delivered_at),
        delivered_count = delivered_count + ?, last_error = ?, updated_at = ?
    WHERE signal_key = ?
  `).bind(status, deliveredAt, delivered, lastError, now(), row.signal_key).run();
  return { delivered, failed };
}

async function pollSignals(env) {
  await ensureSchema(env);
  await resetExpiredClaims(env);
  const signals = await fetchLockedSignals(env);
  const initialized = await runtimeGet(env, 'bridge_initialized');
  if (initialized !== '1') return initializeBaseline(env, signals);

  let discovered = 0;
  for (const signal of signals) {
    const remembered = await rememberSignal(env, signal, 'DISCOVERED');
    if (remembered.inserted) discovered += 1;
  }

  const recipients = await activeMembers(env);
  const pending = await env.DB.prepare(`
    SELECT * FROM telegram_signal_ledger
    WHERE status IN ('DISCOVERED', 'PARTIAL')
    ORDER BY first_seen_at ASC
    LIMIT 25
  `).all();

  let delivered = 0;
  let failed = 0;
  for (const row of pending.results || []) {
    const result = await processSignal(env, row, recipients);
    delivered += Number(result.delivered || 0);
    failed += Number(result.failed || 0);
  }

  await runtimeSet(env, 'last_poll_at', nowIso());
  await runtimeSet(env, 'last_signal_at', signals.at(-1)?.selectedAt || '');
  await runtimeSet(env, 'last_poll_result', `DISCOVERED:${discovered};DELIVERED:${delivered};FAILED:${failed}`);
  await runtimeSet(env, 'last_error', failed ? `${failed} delivery failure(s)` : '');
  return { ok: true, sourceRecords: signals.length, discovered, activeRecipients: recipients.length, delivered, failed };
}

async function bridgeStatus(env) {
  await ensureSchema(env);
  const members = await env.DB.prepare(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) active,
           SUM(CASE WHEN status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END) pending_payment
    FROM telegram_members
  `).first();
  const signals = await env.DB.prepare(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) delivered,
           SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) partial,
           SUM(CASE WHEN status = 'NO_ACTIVE_RECIPIENTS' THEN 1 ELSE 0 END) no_recipients
    FROM telegram_signal_ledger
  `).first();
  return {
    ok: true,
    step: 'STEP_2_SIGNAL_BRIDGE',
    initialized: (await runtimeGet(env, 'bridge_initialized')) === '1',
    members,
    signals,
    lastPollAt: await runtimeGet(env, 'last_poll_at'),
    lastSignalAt: await runtimeGet(env, 'last_signal_at'),
    lastPollResult: await runtimeGet(env, 'last_poll_result'),
    lastError: await runtimeGet(env, 'last_error')
  };
}

async function adminTest(env) {
  await ensureSchema(env);
  const owners = await env.DB.prepare("SELECT * FROM telegram_members WHERE role = 'OWNER' AND status = 'ACTIVE' ORDER BY created_at ASC").all();
  let sent = 0;
  const errors = [];
  for (const owner of owners.results || []) {
    try {
      await sendMessage(env, owner.chat_id, `NOMADTIPS3 · TEST ALERT\nStep 2 Signal Bridge\n${nowIso()}`);
      sent += 1;
    } catch (error) {
      errors.push(clean(error?.message || error));
    }
  }
  return { ok: errors.length === 0, sent, owners: (owners.results || []).length, errors };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    try {
      await ensureSchema(env);
      const url = new URL(request.url);

      if (url.pathname === '/health' && request.method === 'GET') return json(await bridgeStatus(env));
      if (url.pathname === '/bridge/status' && request.method === 'GET') return json(await bridgeStatus(env));
      if (url.pathname === '/telegram/webhook' && request.method === 'POST') return handleTelegramWebhook(request, env);

      if (url.pathname === '/admin/test' && request.method === 'POST') {
        if (!adminOk(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
        return json(await adminTest(env));
      }
      if (url.pathname === '/admin/poll' && request.method === 'POST') {
        if (!adminOk(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
        return json(await pollSignals(env));
      }

      return json({
        ok: true,
        service: 'NOMADTIPS3 Telegram Alerts',
        step: 'STEP_2_SIGNAL_BRIDGE',
        plan: '$3/month',
        routes: ['/health', '/bridge/status', '/telegram/webhook', '/admin/test', '/admin/poll']
      });
    } catch (error) {
      await runtimeSet(env, 'last_error', clean(error?.message || error)).catch(() => null);
      return json({ ok: false, error: clean(error?.message || error) || 'INTERNAL_ERROR' }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(pollSignals(env).catch(async error => {
      await ensureSchema(env).catch(() => null);
      await runtimeSet(env, 'last_poll_at', nowIso()).catch(() => null);
      await runtimeSet(env, 'last_error', clean(error?.message || error)).catch(() => null);
    }));
  }
};

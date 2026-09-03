import { isPaidActiveSubscriber, normalizeSignal, signalKey, signalMessage } from './signal-bridge-core.mjs';

const DEFAULT_SOURCE = 'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
const SIGNAL_LIMIT = 25;
const TELEGRAM_API = 'https://api.telegram.org';

const SIGNAL_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS telegram_signal_ledger (
  signal_key TEXT PRIMARY KEY,
  selected_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'NOMAD',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DISCOVERED',
  first_seen_at INTEGER NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
)`;

const RUNTIME_SQL = `
CREATE TABLE IF NOT EXISTS telegram_signal_runtime (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
)`;

let bridgeSchemaReady = false;

export async function ensureSignalBridgeSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (bridgeSchemaReady) return;
  await env.DB.batch([
    env.DB.prepare(SIGNAL_LEDGER_SQL),
    env.DB.prepare(RUNTIME_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_telegram_signal_ledger_status ON telegram_signal_ledger(status, updated_at)')
  ]);
  bridgeSchemaReady = true;
}

async function runtimeGet(env, key) {
  const row = await env.DB.prepare('SELECT value FROM telegram_signal_runtime WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

async function runtimeSet(env, key, value) {
  const stamp = Date.now();
  await env.DB.prepare(`
    INSERT INTO telegram_signal_runtime(key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, String(value ?? ''), stamp).run();
}

function sourceBase(env) {
  return String(env.NOMAD_SIGNAL_SOURCE_URL || DEFAULT_SOURCE).trim().replace(/\/$/, '');
}

function historyPath() {
  return `/history?page=1&limit=${SIGNAL_LIMIT}`;
}

async function fetchHistoryResponse(env) {
  let serviceStatus = null;
  if (env.NOMAD_SIGNAL_SOURCE && typeof env.NOMAD_SIGNAL_SOURCE.fetch === 'function') {
    const request = new Request(`https://nomad.internal${historyPath()}`, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    const response = await env.NOMAD_SIGNAL_SOURCE.fetch(request);
    serviceStatus = response.status;
    if (response.ok) return { response, transport: 'SERVICE_BINDING' };
  }

  const response = await fetch(`${sourceBase(env)}${historyPath()}`, {
    headers: { accept: 'application/json' }
  });
  if (response.ok) return { response, transport: 'PUBLIC_HTTP' };

  const servicePart = serviceStatus === null ? 'NO_SERVICE_BINDING' : `SERVICE_${serviceStatus}`;
  throw new Error(`NOMAD_HISTORY_${servicePart}_PUBLIC_${response.status}`);
}

export async function fetchLockedSignals(env) {
  const { response, transport } = await fetchHistoryResponse(env);
  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.records)) throw new Error('NOMAD_HISTORY_INVALID_PAYLOAD');
  const normalized = body.records.map(normalizeSignal).filter(Boolean);
  normalized.sort((a, b) => Date.parse(a.selectedAt) - Date.parse(b.selectedAt));
  await runtimeSet(env, 'last_source_transport', transport);
  await runtimeSet(env, 'last_source_record_count', normalized.length);
  return normalized;
}

async function rememberSignal(env, signal, status) {
  const key = await signalKey(signal);
  if (!key) return { key: '', inserted: false };
  const stamp = Date.now();
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO telegram_signal_ledger(
      signal_key, selected_at, source, payload_json, status, first_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    key,
    signal.selectedAt,
    signal.source || 'NOMAD',
    JSON.stringify(signal.raw || signal),
    status,
    stamp,
    stamp
  ).run();
  return { key, inserted: Number(result?.meta?.changes || 0) > 0 };
}

async function activeSubscribers(env) {
  const result = await env.DB.prepare(`
    SELECT chat_id, status, active
    FROM telegram_subscribers
    WHERE status = 'ACTIVE' AND active = 1
    ORDER BY created_at ASC
  `).all();
  return (result.results || []).filter(isPaidActiveSubscriber);
}

function telegramUrl(env, method) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

async function sendTelegram(env, chatId, text) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(telegramUrl(env, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(chatId),
          text: String(text).slice(0, 3900),
          disable_web_page_preview: true
        })
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok !== false) return payload;
      lastError = new Error(payload?.description || `Telegram HTTP ${response.status}`);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Telegram send failed');
}

async function reserveSignalDelivery(env, signalKeyValue, chatId, payload) {
  const deliveryKey = `SIGNAL:${signalKeyValue}:${chatId}`;
  const stamp = Date.now();
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO telegram_deliveries(
      delivery_key, chat_id, event_type, status, payload_json, created_at, sent_at, error, updated_at
    ) VALUES (?, ?, 'SIGNAL', 'PENDING', ?, ?, NULL, NULL, ?)
  `).bind(deliveryKey, String(chatId), JSON.stringify(payload || {}), stamp, stamp).run();
  return { deliveryKey, reserved: Number(result?.meta?.changes || 0) > 0 };
}

async function finishSignalDelivery(env, deliveryKey, status, payload, error = null) {
  const stamp = Date.now();
  await env.DB.prepare(`
    UPDATE telegram_deliveries
    SET status = ?, payload_json = ?, sent_at = ?, error = ?, updated_at = ?
    WHERE delivery_key = ?
  `).bind(
    status,
    JSON.stringify(payload || {}),
    status === 'SENT' ? stamp : null,
    error ? String(error).slice(0, 500) : null,
    stamp,
    deliveryKey
  ).run();
}

async function deliverSignal(env, signal, key, subscribers) {
  if (!subscribers.length) {
    await env.DB.prepare(`
      UPDATE telegram_signal_ledger
      SET status = 'NO_ACTIVE_RECIPIENTS', updated_at = ?
      WHERE signal_key = ?
    `).bind(Date.now(), key).run();
    return { delivered: 0, failed: 0, duplicates: 0, noActiveRecipients: true };
  }

  const text = signalMessage(signal);
  let delivered = 0;
  let failed = 0;
  let duplicates = 0;
  let lastError = null;

  for (const subscriber of subscribers) {
    const reservation = await reserveSignalDelivery(env, key, subscriber.chat_id, {
      signalKey: key,
      selectedAt: signal.selectedAt,
      text
    });
    if (!reservation.reserved) {
      duplicates += 1;
      continue;
    }
    try {
      const result = await sendTelegram(env, subscriber.chat_id, text);
      await finishSignalDelivery(env, reservation.deliveryKey, 'SENT', {
        signalKey: key,
        selectedAt: signal.selectedAt,
        text,
        messageId: result?.result?.message_id ?? null
      });
      delivered += 1;
    } catch (error) {
      lastError = error?.message || String(error);
      await finishSignalDelivery(env, reservation.deliveryKey, 'FAILED', {
        signalKey: key,
        selectedAt: signal.selectedAt,
        text
      }, lastError);
      failed += 1;
    }
  }

  const status = failed > 0 ? 'PARTIAL' : 'DELIVERED';
  await env.DB.prepare(`
    UPDATE telegram_signal_ledger
    SET status = ?, delivered_count = delivered_count + ?, last_error = ?, updated_at = ?
    WHERE signal_key = ?
  `).bind(status, delivered, lastError, Date.now(), key).run();
  return { delivered, failed, duplicates, noActiveRecipients: false };
}

async function initializeBaseline(env, signals) {
  let baseline = 0;
  for (const signal of signals) {
    const remembered = await rememberSignal(env, signal, 'BASELINE');
    if (remembered.inserted) baseline += 1;
  }
  await runtimeSet(env, 'bridge_initialized', '1');
  await runtimeSet(env, 'last_poll_at', new Date().toISOString());
  await runtimeSet(env, 'last_signal_at', signals.at(-1)?.selectedAt || '');
  await runtimeSet(env, 'last_poll_result', `BASELINE:${baseline}`);
  await runtimeSet(env, 'last_error', '');
  return {
    ok: true,
    phase: 'STEP_2_SIGNAL_BRIDGE',
    initializedNow: true,
    sourceRecords: signals.length,
    baseline,
    discovered: 0,
    activeRecipients: 0,
    delivered: 0,
    failed: 0
  };
}

export async function pollSignals(env) {
  await ensureSignalBridgeSchema(env);
  const signals = await fetchLockedSignals(env);
  const initialized = await runtimeGet(env, 'bridge_initialized');
  if (initialized !== '1') return initializeBaseline(env, signals);

  const subscribers = await activeSubscribers(env);
  let discovered = 0;
  let delivered = 0;
  let failed = 0;
  let duplicates = 0;
  let noActiveRecipients = 0;

  for (const signal of signals) {
    const remembered = await rememberSignal(env, signal, 'DISCOVERED');
    if (!remembered.inserted) continue;
    discovered += 1;
    const delivery = await deliverSignal(env, signal, remembered.key, subscribers);
    delivered += delivery.delivered;
    failed += delivery.failed;
    duplicates += delivery.duplicates;
    if (delivery.noActiveRecipients) noActiveRecipients += 1;
  }

  await runtimeSet(env, 'last_poll_at', new Date().toISOString());
  await runtimeSet(env, 'last_signal_at', signals.at(-1)?.selectedAt || '');
  await runtimeSet(env, 'last_poll_result', `DISCOVERED:${discovered};DELIVERED:${delivered};FAILED:${failed}`);
  await runtimeSet(env, 'last_error', failed ? `${failed} Telegram delivery failure(s)` : '');

  return {
    ok: true,
    phase: 'STEP_2_SIGNAL_BRIDGE',
    initializedNow: false,
    sourceRecords: signals.length,
    discovered,
    activeRecipients: subscribers.length,
    delivered,
    failed,
    duplicates,
    noActiveRecipients
  };
}

export async function signalBridgeStatus(env) {
  await ensureSignalBridgeSchema(env);
  const subscribers = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'ACTIVE' AND active = 1 THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status = 'PENDING_PAYMENT' AND active = 0 THEN 1 ELSE 0 END) AS pending_payment
    FROM telegram_subscribers
  `).first();
  const signals = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'BASELINE' THEN 1 ELSE 0 END) AS baseline,
           SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) AS partial,
           SUM(CASE WHEN status = 'NO_ACTIVE_RECIPIENTS' THEN 1 ELSE 0 END) AS no_active_recipients
    FROM telegram_signal_ledger
  `).first();
  return {
    ok: true,
    phase: 'STEP_2_SIGNAL_BRIDGE',
    source: sourceBase(env),
    sourceTransport: await runtimeGet(env, 'last_source_transport'),
    sourceRecordCount: Number(await runtimeGet(env, 'last_source_record_count') || 0),
    initialized: (await runtimeGet(env, 'bridge_initialized')) === '1',
    subscribers,
    signals,
    lastPollAt: await runtimeGet(env, 'last_poll_at'),
    lastSignalAt: await runtimeGet(env, 'last_signal_at'),
    lastPollResult: await runtimeGet(env, 'last_poll_result'),
    lastError: await runtimeGet(env, 'last_error')
  };
}

export async function recordBridgeError(env, error) {
  try {
    await ensureSignalBridgeSchema(env);
    await runtimeSet(env, 'last_poll_at', new Date().toISOString());
    await runtimeSet(env, 'last_error', error?.message || String(error));
  } catch {
    // Preserve the original error path; health/status will expose DB failure separately.
  }
}

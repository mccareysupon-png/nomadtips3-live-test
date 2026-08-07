export { handleLineWebhook, lineStatus } from './line.js';

const LINE_API = 'https://api.line.me/v2/bot/message';

const SUBSCRIBERS_SQL = `
CREATE TABLE IF NOT EXISTS line_subscribers (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  subscribed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const DELIVERIES_SQL = `
CREATE TABLE IF NOT EXISTS line_deliveries (
  delivery_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare(DELIVERIES_SQL)
  ]);
  schemaReady = true;
}

async function pushText(env, userId, text) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  const response = await fetch(`${LINE_API}/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: String(text).slice(0, 5000) }]
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `LINE HTTP ${response.status}`);
}

function signed(value, digits = 2) {
  const number = Number(value || 0);
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

function handicap(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? '+' : ''}${number}`;
}

function signalText(trade) {
  const side = String(trade.selected_side || 'HOME').toUpperCase();
  return [
    '🚨 NOMAD LIVE SIGNAL',
    '',
    `${trade.selected_team} vs ${trade.opponent}`,
    `Selected side: ${side}`,
    `นาที ${trade.entry_minute}′ | สกอร์ ${trade.entry_selected_score}-${trade.entry_opponent_score}`,
    `Momentum ${Math.round(Number(trade.momentum || 0))}%`,
    '',
    `Selected AH ${handicap(trade.ah_line)} @ ${Number(trade.ah_odds).toFixed(2)}`,
    `Paper Investment: ${Number(trade.stake_units || 100)} Units`,
    '',
    'สถานะ: PENDING'
  ].join('\n');
}

async function resultSummary(env) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('SETTLED','VOID') THEN profit_units ELSE 0 END), 0) AS net_units,
      COALESCE(SUM(CASE WHEN status IN ('SETTLED','VOID') THEN stake_units ELSE 0 END), 0) AS settled_stake
    FROM paper_trades_side
  `).first();
  const net = Number(row?.net_units || 0);
  const stake = Number(row?.settled_stake || 0);
  return { net, roi: stake > 0 ? net / stake * 100 : 0 };
}

async function resultText(env, trade) {
  const summary = await resultSummary(env);
  const icon = trade.result === 'CORRECT' ? '✅' : trade.result === 'INCORRECT' ? '❌' : '➖';
  const finalScore = trade.final_selected_score === null
    ? 'VOID'
    : `${trade.final_selected_score}-${trade.final_opponent_score}`;
  const postScore = trade.post_entry_selected_goals === null
    ? '—'
    : `${trade.post_entry_selected_goals}-${trade.post_entry_opponent_goals}`;
  return [
    `${icon} NOMAD RESULT — ${trade.settlement}`,
    '',
    `${trade.selected_team} vs ${trade.opponent}`,
    `Selected side: ${String(trade.selected_side || 'HOME').toUpperCase()}`,
    `Final selected-opponent: ${finalScore} | หลัง Alert: ${postScore}`,
    `ผล: ${trade.result}`,
    '',
    `กำไร/ขาดทุน: ${signed(trade.profit_units)} Units`,
    `คืนหน่วย: ${Number(trade.returned_units || 0).toFixed(2)} Units`,
    `กำไรสะสม: ${signed(summary.net)} Units`,
    `ROI: ${signed(summary.roi)}%`
  ].join('\n');
}

async function deliveryExists(env, keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return false;
  const placeholders = list.map(() => '?').join(',');
  const row = await env.DB.prepare(
    `SELECT status FROM line_deliveries WHERE delivery_key IN (${placeholders}) AND status = 'SENT' LIMIT 1`
  ).bind(...list).first();
  return Boolean(row);
}

async function saveDelivery(env, key, userId, fixtureId, eventType, status, error = null) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO line_deliveries
      (delivery_key, user_id, fixture_id, event_type, status, sent_at, error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(delivery_key) DO UPDATE SET
      status = excluded.status,
      sent_at = excluded.sent_at,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).bind(
    key, userId, fixtureId, eventType, status,
    status === 'SENT' ? now : null,
    error ? String(error).slice(0, 500) : null,
    now
  ).run();
}

async function sendEvent(env, subscriber, trade, eventType, text) {
  const key = `${eventType}:${trade.trade_key}:${subscriber.user_id}`;
  const legacyKey = String(trade.selected_side || 'HOME').toUpperCase() === 'HOME'
    ? `${eventType}:${trade.fixture_id}:${subscriber.user_id}`
    : null;
  if (await deliveryExists(env, [key, legacyKey])) return false;
  try {
    await pushText(env, subscriber.user_id, text);
    await saveDelivery(env, key, subscriber.user_id, trade.fixture_id, eventType, 'SENT');
    return true;
  } catch (error) {
    await saveDelivery(env, key, subscriber.user_id, trade.fixture_id, eventType, 'FAILED', error?.message || error);
    return false;
  }
}

export async function notifyPendingLineEvents(env) {
  await ensureSchema(env);
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { configured: false, subscribers: 0, sent: 0 };

  const subscribersQuery = await env.DB.prepare(`
    SELECT user_id, subscribed_at
    FROM line_subscribers
    WHERE active = 1
  `).all();
  const subscribers = subscribersQuery.results || [];
  if (!subscribers.length) return { configured: true, subscribers: 0, sent: 0 };

  let sent = 0;
  for (const subscriber of subscribers) {
    let trades = [];
    try {
      const query = await env.DB.prepare(`
        SELECT * FROM paper_trades_side
        WHERE created_at >= ? OR (settled_at IS NOT NULL AND settled_at >= ?)
        ORDER BY created_at ASC
        LIMIT 500
      `).bind(subscriber.subscribed_at, subscriber.subscribed_at).all();
      trades = query.results || [];
    } catch {
      continue;
    }

    for (const trade of trades) {
      if (Number(trade.created_at) >= Number(subscriber.subscribed_at)) {
        if (await sendEvent(env, subscriber, trade, 'SIGNAL', signalText(trade))) sent += 1;
      }
      if (['SETTLED', 'VOID'].includes(String(trade.status)) &&
          Number(trade.settled_at || 0) >= Number(subscriber.subscribed_at)) {
        const text = await resultText(env, trade);
        if (await sendEvent(env, subscriber, trade, 'RESULT', text)) sent += 1;
      }
    }
  }

  return { configured: true, subscribers: subscribers.length, sent };
}

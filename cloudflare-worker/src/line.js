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

const DELIVERY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_line_deliveries_fixture
ON line_deliveries(fixture_id, event_type)
`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare(DELIVERIES_SQL),
    env.DB.prepare(DELIVERY_INDEX_SQL)
  ]);
  schemaReady = true;
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function verifySignature(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    bytesFromBase64(signature),
    new TextEncoder().encode(rawBody)
  );
}

async function lineRequest(env, endpoint, body) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }
  const response = await fetch(`${LINE_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `LINE HTTP ${response.status}`);
  }
  return payload;
}

async function replyText(env, replyToken, text) {
  if (!replyToken || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  await lineRequest(env, 'reply', {
    replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 5000) }]
  });
}

async function pushText(env, userId, text) {
  await lineRequest(env, 'push', {
    to: userId,
    messages: [{ type: 'text', text: String(text).slice(0, 5000) }]
  });
}

async function setSubscriber(env, userId, active) {
  if (!userId) return;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO line_subscribers (user_id, active, subscribed_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      active = excluded.active,
      subscribed_at = CASE
        WHEN line_subscribers.active = 0 AND excluded.active = 1 THEN excluded.subscribed_at
        ELSE line_subscribers.subscribed_at
      END,
      updated_at = excluded.updated_at
  `).bind(userId, active ? 1 : 0, now, now).run();
}

function commandOf(event) {
  if (event?.type !== 'message' || event?.message?.type !== 'text') return '';
  return String(event.message.text || '').trim().toLowerCase();
}

export async function handleLineWebhook(request, env) {
  await ensureSchema(env);
  if (!env.LINE_CHANNEL_SECRET) {
    return { status: 503, data: { ok: false, error: 'LINE_CHANNEL_SECRET is not configured' } };
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') || '';
  const valid = await verifySignature(env.LINE_CHANNEL_SECRET, rawBody, signature).catch(() => false);
  if (!valid) {
    return { status: 401, data: { ok: false, error: 'Invalid LINE signature' } };
  }

  const body = JSON.parse(rawBody || '{}');
  for (const event of Array.isArray(body.events) ? body.events : []) {
    const userId = event?.source?.userId;
    if (!userId) continue;

    if (event.type === 'follow') {
      await setSubscriber(env, userId, true);
      await replyText(env, event.replyToken,
        'เปิดแจ้งเตือน NOMADTIPS3 แล้ว\nระบบจะส่งเมื่อมี Live Signal และเมื่อรายการถูกตัดสินผล');
      continue;
    }

    if (event.type === 'unfollow') {
      await setSubscriber(env, userId, false);
      continue;
    }

    const command = commandOf(event);
    if (['เปิดแจ้งเตือน', 'เปิด', 'start', 'subscribe'].includes(command)) {
      await setSubscriber(env, userId, true);
      await replyText(env, event.replyToken,
        '✅ เปิดแจ้งเตือนแล้ว\nรับ Live Signal และผล Paper Investment อัตโนมัติ');
    } else if (['ปิดแจ้งเตือน', 'ปิด', 'stop', 'unsubscribe'].includes(command)) {
      await setSubscriber(env, userId, false);
      await replyText(env, event.replyToken, '🔕 ปิดแจ้งเตือนแล้ว');
    } else if (['สถานะ', 'status'].includes(command)) {
      const subscriber = await env.DB.prepare(
        'SELECT active FROM line_subscribers WHERE user_id = ?'
      ).bind(userId).first();
      await replyText(env, event.replyToken,
        Number(subscriber?.active) === 1
          ? '🟢 NOMADTIPS3 LINE Alert: เปิดอยู่'
          : '⚪ NOMADTIPS3 LINE Alert: ปิดอยู่\nพิมพ์ “เปิดแจ้งเตือน” เพื่อเปิด');
    }
  }

  return { status: 200, data: { ok: true } };
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
  return [
    '🚨 NOMAD LIVE SIGNAL',
    '',
    `${trade.home} vs ${trade.away}`,
    `นาที ${trade.entry_minute}′ | สกอร์ ${trade.entry_home_score}-${trade.entry_away_score}`,
    `Home Momentum ${Math.round(Number(trade.momentum || 0))}%`,
    '',
    `Home AH ${handicap(trade.ah_line)} @ ${Number(trade.ah_odds).toFixed(2)}`,
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
    FROM paper_trades
  `).first();
  const net = Number(row?.net_units || 0);
  const stake = Number(row?.settled_stake || 0);
  return { net, roi: stake > 0 ? net / stake * 100 : 0 };
}

async function resultText(env, trade) {
  const summary = await resultSummary(env);
  const icon = trade.result === 'CORRECT' ? '✅' : trade.result === 'INCORRECT' ? '❌' : '➖';
  const finalScore = trade.final_home_score === null
    ? 'VOID'
    : `${trade.final_home_score}-${trade.final_away_score}`;
  const postScore = trade.post_entry_home_goals === null
    ? '—'
    : `${trade.post_entry_home_goals}-${trade.post_entry_away_goals}`;
  return [
    `${icon} NOMAD RESULT — ${trade.settlement}`,
    '',
    `${trade.home} vs ${trade.away}`,
    `Final: ${finalScore} | หลัง Alert: ${postScore}`,
    `ผล: ${trade.result}`,
    '',
    `กำไร/ขาดทุน: ${signed(trade.profit_units)} Units`,
    `คืนหน่วย: ${Number(trade.returned_units || 0).toFixed(2)} Units`,
    `กำไรสะสม: ${signed(summary.net)} Units`,
    `ROI: ${signed(summary.roi)}%`
  ].join('\n');
}

async function deliveryExists(env, key) {
  const row = await env.DB.prepare(
    "SELECT status FROM line_deliveries WHERE delivery_key = ? AND status = 'SENT'"
  ).bind(key).first();
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
  const key = `${eventType}:${trade.fixture_id}:${subscriber.user_id}`;
  if (await deliveryExists(env, key)) return false;
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
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return { configured: false, subscribers: 0, sent: 0 };
  }

  const subscribersQuery = await env.DB.prepare(`
    SELECT user_id, subscribed_at
    FROM line_subscribers
    WHERE active = 1
  `).all();
  const subscribers = subscribersQuery.results || [];
  if (!subscribers.length) return { configured: true, subscribers: 0, sent: 0 };

  let sent = 0;
  for (const subscriber of subscribers) {
    const tradesQuery = await env.DB.prepare(`
      SELECT * FROM paper_trades
      WHERE created_at >= ? OR (settled_at IS NOT NULL AND settled_at >= ?)
      ORDER BY created_at ASC
      LIMIT 500
    `).bind(subscriber.subscribed_at, subscriber.subscribed_at).all();

    for (const trade of tradesQuery.results || []) {
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

export async function lineStatus(env) {
  await ensureSchema(env);
  const active = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM line_subscribers WHERE active = 1'
  ).first();
  const last = await env.DB.prepare(`
    SELECT event_type, status, sent_at, error
    FROM line_deliveries
    ORDER BY updated_at DESC
    LIMIT 1
  `).first();
  return {
    ok: true,
    configured: Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN),
    activeSubscribers: Number(active?.count || 0),
    lastDelivery: last || null,
    generatedAt: new Date().toISOString()
  };
}

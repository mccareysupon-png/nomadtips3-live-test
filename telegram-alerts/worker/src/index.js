const TELEGRAM_API = 'https://api.telegram.org';
const WEBHOOK_PATH = '/telegram/webhook';

const SUBSCRIBERS_SQL = `
CREATE TABLE IF NOT EXISTS telegram_subscribers (
  chat_id TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  username TEXT,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const DELIVERIES_SQL = `
CREATE TABLE IF NOT EXISTS telegram_deliveries (
  delivery_key TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
)`;

const UPDATES_SQL = `
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  received_at INTEGER NOT NULL
)`;

let schemaReady = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function safeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function validWebhookSecret(secret) {
  return /^[A-Za-z0-9_-]{1,256}$/.test(String(secret || ''));
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare(DELIVERIES_SQL),
    env.DB.prepare(UPDATES_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_status ON telegram_subscribers(status, active)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_chat ON telegram_deliveries(chat_id, updated_at)')
  ]);
  schemaReady = true;
}

function telegramUrl(env, method) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

async function telegramRequest(env, method, body) {
  const response = await fetch(telegramUrl(env, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram HTTP ${response.status}`);
  }
  return payload;
}

async function sendText(env, chatId, text) {
  return telegramRequest(env, 'sendMessage', {
    chat_id: String(chatId),
    text: String(text).slice(0, 3900),
    disable_web_page_preview: true
  });
}

async function upsertSubscriber(env, message) {
  await ensureSchema(env);
  const chatId = String(message?.chat?.id || '').trim();
  if (!chatId) return null;
  const user = message?.from || {};
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO telegram_subscribers (
      chat_id, telegram_user_id, username, first_name, status, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'PENDING_PAYMENT', 0, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      telegram_user_id = excluded.telegram_user_id,
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = excluded.updated_at
  `).bind(
    chatId,
    user?.id == null ? null : String(user.id),
    user?.username ? String(user.username).slice(0, 64) : null,
    user?.first_name ? String(user.first_name).slice(0, 128) : null,
    now,
    now
  ).run();
  return env.DB.prepare('SELECT * FROM telegram_subscribers WHERE chat_id = ?').bind(chatId).first();
}

async function subscriberState(env, chatId) {
  await ensureSchema(env);
  return env.DB.prepare(`
    SELECT chat_id, status, active, created_at, updated_at
    FROM telegram_subscribers
    WHERE chat_id = ?
  `).bind(String(chatId)).first();
}

async function markUpdateOnce(env, updateId) {
  await ensureSchema(env);
  if (!Number.isInteger(Number(updateId))) return true;
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO telegram_updates (update_id, received_at)
    VALUES (?, ?)
  `).bind(Number(updateId), Date.now()).run();
  return Number(result?.meta?.changes || 0) > 0;
}

function commandOf(message) {
  const text = String(message?.text || '').trim();
  if (!text.startsWith('/')) return '';
  return text.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
}

async function handleTelegramMessage(env, message) {
  const chatId = String(message?.chat?.id || '').trim();
  if (!chatId) return;
  const command = commandOf(message);

  if (command === '/start') {
    await upsertSubscriber(env, message);
    await sendText(env, chatId,
      'NOMADTIPS3 Telegram Alerts\n\nลงทะเบียน Telegram สำหรับระบบแจ้งเตือนแล้ว\nสถานะ: PENDING PAYMENT\n\nขั้นตอนชำระเงิน $3/เดือน จะเชื่อมในขั้นถัดไปของระบบ'
    );
    return;
  }

  if (command === '/status') {
    const row = await subscriberState(env, chatId);
    if (!row) {
      await sendText(env, chatId, 'ยังไม่ได้ลงทะเบียน กรุณาส่ง /start');
      return;
    }
    await sendText(env, chatId,
      `NOMADTIPS3 Telegram Alerts\nStatus: ${row.status}\nDelivery: ${Number(row.active) === 1 ? 'ACTIVE' : 'NOT ACTIVE'}`
    );
    return;
  }

  if (command === '/help') {
    await sendText(env, chatId, 'คำสั่งที่ใช้ได้\n/start — ลงทะเบียน\n/status — ตรวจสถานะ\n/help — วิธีใช้งาน');
  }
}

async function handleWebhook(request, env) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!validWebhookSecret(expected)) {
    return json({ ok: false, error: 'Webhook secret is not configured' }, 503);
  }
  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!safeEqual(expected, supplied)) {
    return json({ ok: false, error: 'Invalid Telegram webhook secret' }, 401);
  }

  const update = await request.json().catch(() => null);
  if (!update || typeof update !== 'object') return json({ ok: false, error: 'Invalid JSON' }, 400);
  const fresh = await markUpdateOnce(env, update.update_id);
  if (!fresh) return json({ ok: true, duplicate: true });

  const message = update.message || update.edited_message || null;
  if (message) await handleTelegramMessage(env, message);
  return json({ ok: true });
}

function isAdmin(request, env) {
  const expected = String(env.TELEGRAM_ADMIN_TOKEN || '').trim();
  const supplied = request.headers.get('X-NOMAD-ADMIN-TOKEN') || '';
  return safeEqual(expected, supplied);
}

async function saveDelivery(env, key, chatId, eventType, status, payload, error = null) {
  await ensureSchema(env);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO telegram_deliveries (
      delivery_key, chat_id, event_type, status, payload_json, created_at, sent_at, error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(delivery_key) DO UPDATE SET
      status = excluded.status,
      payload_json = excluded.payload_json,
      sent_at = excluded.sent_at,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).bind(
    key,
    String(chatId),
    String(eventType),
    String(status),
    JSON.stringify(payload || {}),
    now,
    status === 'SENT' ? now : null,
    error ? String(error).slice(0, 500) : null,
    now
  ).run();
}

async function handleAdminTest(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const chatId = String(body?.chatId || env.TELEGRAM_TEST_CHAT_ID || '').trim();
  if (!chatId) return json({ ok: false, error: 'chatId or TELEGRAM_TEST_CHAT_ID is required' }, 400);
  const text = String(body?.text || '✅ NOMADTIPS3 Telegram TEST ALERT\nTelegram Core Step 1 is connected.').slice(0, 3900);
  const key = `TEST:${Date.now()}:${chatId}`;
  try {
    const result = await sendText(env, chatId, text);
    await saveDelivery(env, key, chatId, 'TEST', 'SENT', { text, messageId: result?.result?.message_id ?? null });
    return json({ ok: true, sent: true, chatId, deliveryKey: key });
  } catch (error) {
    await saveDelivery(env, key, chatId, 'TEST', 'FAILED', { text }, error?.message || error);
    return json({ ok: false, sent: false, error: error?.message || 'Telegram send failed', deliveryKey: key }, 502);
  }
}

async function handleSetWebhook(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const webhookUrl = String(env.TELEGRAM_PUBLIC_WEBHOOK_URL || '').trim();
  const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!/^https:\/\//i.test(webhookUrl)) return json({ ok: false, error: 'TELEGRAM_PUBLIC_WEBHOOK_URL must be HTTPS' }, 503);
  if (!validWebhookSecret(secret)) return json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is invalid' }, 503);
  const result = await telegramRequest(env, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false
  });
  return json({ ok: true, webhookUrl, telegram: result?.result === true });
}

async function handleHealth(env) {
  let db = false;
  try {
    await ensureSchema(env);
    db = true;
  } catch {
    db = false;
  }
  return json({
    ok: db,
    service: 'nomadtips3-telegram-alerts',
    phase: 'STEP_1_TELEGRAM_CORE',
    environment: String(env.ENVIRONMENT || 'test'),
    configured: {
      db,
      botToken: Boolean(String(env.TELEGRAM_BOT_TOKEN || '').trim()),
      webhookSecret: validWebhookSecret(env.TELEGRAM_WEBHOOK_SECRET),
      adminToken: Boolean(String(env.TELEGRAM_ADMIN_TOKEN || '').trim()),
      publicWebhookUrl: /^https:\/\//i.test(String(env.TELEGRAM_PUBLIC_WEBHOOK_URL || '').trim()),
      testChatId: Boolean(String(env.TELEGRAM_TEST_CHAT_ID || '').trim())
    }
  }, db ? 200 : 503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return handleHealth(env);
    if (url.pathname === WEBHOOK_PATH && request.method === 'POST') return handleWebhook(request, env);
    if (url.pathname === '/admin/test' && request.method === 'POST') return handleAdminTest(request, env);
    if (url.pathname === '/admin/set-webhook' && request.method === 'POST') return handleSetWebhook(request, env);
    return json({ ok: false, error: 'Not found' }, 404);
  }
};

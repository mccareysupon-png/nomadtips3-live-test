const DEFAULT_PAYMENT_LINK = 'https://buy.stripe.com/28E14n2H8bqFcm01Jd8AE01';
const COOKIE_NAME = 'nomad_activation';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const STRIPE_TOLERANCE_SECONDS = 300;
const LINE_API = 'https://api.line.me/v2/bot/message';

const MEMBERSHIP_SQL = `
CREATE TABLE IF NOT EXISTS paid_memberships (
  activation_id TEXT PRIMARY KEY,
  activation_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'INITIATED',
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_payment_status TEXT,
  line_user_id TEXT UNIQUE,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  activated_at INTEGER,
  updated_at INTEGER NOT NULL
)`;

const EVENT_SQL = `
CREATE TABLE IF NOT EXISTS stripe_membership_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL
)`;

const SUBSCRIBERS_SQL = `
CREATE TABLE IF NOT EXISTS line_subscribers (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  subscribed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function html(markup, status = 200, headers = {}) {
  return new Response(markup, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', ...headers }
  });
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(MEMBERSHIP_SQL),
    env.DB.prepare(EVENT_SQL),
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_paid_memberships_customer ON paid_memberships(stripe_customer_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_paid_memberships_subscription ON paid_memberships(stripe_subscription_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_paid_memberships_line ON paid_memberships(line_user_id)')
  ]);
  schemaReady = true;
}

function randomHex(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map(value => value.toString(16).padStart(2, '0')).join('');
}

function activationId() {
  return `m_${randomHex(16)}`;
}

function activationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const data = new Uint8Array(8);
  crypto.getRandomValues(data);
  return [...data].map(value => alphabet[value % alphabet.length]).join('');
}

function activationCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/membership; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function parseCookies(request) {
  const cookie = request.headers.get('Cookie') || '';
  const output = {};
  for (const chunk of cookie.split(';')) {
    const index = chunk.indexOf('=');
    if (index < 0) continue;
    const key = chunk.slice(0, index).trim();
    const value = chunk.slice(index + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

function getActivationFromRequest(request, url) {
  const query = String(url.searchParams.get('activation') || '').trim();
  if (query) return query;
  return String(parseCookies(request)[COOKIE_NAME] || '').trim();
}

function paymentLink(env) {
  return String(env.NOMAD_STRIPE_PAYMENT_LINK || DEFAULT_PAYMENT_LINK).trim();
}

function safeLineUrl(env) {
  const value = String(env.LINE_ADD_FRIEND_URL || '').trim();
  return /^https:\/\/(line\.me|lin\.ee)\//i.test(value) ? value : '';
}

async function createActivation(env) {
  await ensureSchema(env);
  const now = Date.now();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = activationId();
    const code = activationCode();
    try {
      await env.DB.prepare(`
        INSERT INTO paid_memberships
          (activation_id, activation_code, status, created_at, updated_at)
        VALUES (?, ?, 'INITIATED', ?, ?)
      `).bind(id, code, now, now).run();
      return { activationId: id, activationCode: code };
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  throw new Error('Could not create activation');
}

async function membershipByActivation(env, id) {
  if (!id) return null;
  await ensureSchema(env);
  return env.DB.prepare('SELECT * FROM paid_memberships WHERE activation_id = ?').bind(id).first();
}

function publicMembership(row) {
  if (!row) return null;
  return {
    activationId: row.activation_id,
    activationCode: row.activation_code,
    status: row.status,
    paymentStatus: row.stripe_payment_status || null,
    lineLinked: Boolean(row.line_user_id),
    cancelAtPeriodEnd: Boolean(Number(row.cancel_at_period_end || 0)),
    currentPeriodEnd: Number(row.current_period_end || 0) || null,
    paidAt: Number(row.paid_at || 0) || null,
    activatedAt: Number(row.activated_at || 0) || null
  };
}

function entitlementState(subscriptionStatus) {
  const value = String(subscriptionStatus || '').toLowerCase();
  if (['active', 'trialing'].includes(value)) return 'PAID';
  if (['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].includes(value)) return 'PAST_DUE';
  if (['canceled'].includes(value)) return 'CANCELED';
  return null;
}

async function setSubscriber(env, userId, active, subscribedAt = Date.now()) {
  if (!userId) return;
  await ensureSchema(env);
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
  `).bind(userId, active ? 1 : 0, subscribedAt, now).run();
}

async function disableLineForMembership(env, row) {
  const userId = row?.line_user_id;
  if (userId) await setSubscriber(env, userId, false).catch(() => null);
}

function stripeSubscriptionId(object) {
  return object?.subscription || object?.parent?.subscription_details?.subscription || null;
}

function stripeCustomerId(object) {
  return typeof object?.customer === 'string' ? object.customer : object?.customer?.id || null;
}

async function updateFromCheckout(env, session, failed = false) {
  const activation = String(session?.client_reference_id || '').trim();
  if (!activation) return null;
  const row = await membershipByActivation(env, activation);
  if (!row) return null;
  const now = Date.now();
  const paid = !failed && ['paid', 'no_payment_required'].includes(String(session?.payment_status || '').toLowerCase());
  const nextStatus = failed ? 'FAILED' : (paid ? (row.line_user_id ? 'ACTIVE' : 'PAID') : 'INITIATED');
  await env.DB.prepare(`
    UPDATE paid_memberships
    SET status = ?,
        stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id),
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        stripe_payment_status = COALESCE(?, stripe_payment_status),
        paid_at = CASE WHEN ? = 1 AND paid_at IS NULL THEN ? ELSE paid_at END,
        updated_at = ?
    WHERE activation_id = ?
  `).bind(
    nextStatus,
    session?.id || null,
    stripeCustomerId(session),
    session?.subscription || null,
    session?.payment_status || null,
    paid ? 1 : 0,
    now,
    now,
    activation
  ).run();
  if (failed) await disableLineForMembership(env, row);
  return membershipByActivation(env, activation);
}

async function findMembershipForStripeObject(env, object) {
  await ensureSchema(env);
  const subscription = stripeSubscriptionId(object) || (object?.id?.startsWith?.('sub_') ? object.id : null);
  const customer = stripeCustomerId(object);
  if (subscription) {
    const row = await env.DB.prepare('SELECT * FROM paid_memberships WHERE stripe_subscription_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(subscription).first();
    if (row) return row;
  }
  if (customer) {
    return env.DB.prepare('SELECT * FROM paid_memberships WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(customer).first();
  }
  return null;
}

async function updateFromInvoice(env, invoice, paid) {
  const row = await findMembershipForStripeObject(env, invoice);
  if (!row) return null;
  const now = Date.now();
  const status = paid ? (row.line_user_id ? 'ACTIVE' : 'PAID') : 'PAST_DUE';
  await env.DB.prepare(`
    UPDATE paid_memberships
    SET status = ?, stripe_payment_status = ?, paid_at = CASE WHEN ? = 1 THEN COALESCE(paid_at, ?) ELSE paid_at END, updated_at = ?
    WHERE activation_id = ?
  `).bind(status, paid ? 'paid' : 'failed', paid ? 1 : 0, now, now, row.activation_id).run();
  if (!paid) await disableLineForMembership(env, row);
  return membershipByActivation(env, row.activation_id);
}

async function updateFromSubscription(env, subscription, deleted = false) {
  const row = await findMembershipForStripeObject(env, subscription);
  if (!row) return null;
  const now = Date.now();
  const baseStatus = deleted ? 'CANCELED' : entitlementState(subscription?.status);
  if (!baseStatus) return row;
  const finalStatus = baseStatus === 'PAID' && row.line_user_id ? 'ACTIVE' : baseStatus;
  const periodEnd = Number(subscription?.current_period_end || 0);
  await env.DB.prepare(`
    UPDATE paid_memberships
    SET status = ?,
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        current_period_end = CASE WHEN ? > 0 THEN ? ELSE current_period_end END,
        cancel_at_period_end = ?,
        updated_at = ?
    WHERE activation_id = ?
  `).bind(
    finalStatus,
    subscription?.id || null,
    stripeCustomerId(subscription),
    periodEnd,
    periodEnd,
    subscription?.cancel_at_period_end ? 1 : 0,
    now,
    row.activation_id
  ).run();
  if (!['PAID', 'ACTIVE'].includes(finalStatus)) await disableLineForMembership(env, row);
  return membershipByActivation(env, row.activation_id);
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function timingSafeHexEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseStripeSignature(header) {
  const parts = String(header || '').split(',').map(item => item.trim());
  const timestamps = [];
  const signatures = [];
  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't' && value) timestamps.push(value);
    if (key === 'v1' && value) signatures.push(value);
  }
  return { timestamp: timestamps[0] || '', signatures };
}

async function verifyStripeSignature(secret, rawBody, header) {
  if (!secret || !header) return false;
  const parsed = parseStripeSignature(header);
  const timestamp = Number(parsed.timestamp || 0);
  if (!Number.isFinite(timestamp) || !parsed.signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > STRIPE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parsed.timestamp}.${rawBody}`));
  const expected = hex(signed);
  return parsed.signatures.some(value => timingSafeHexEqual(expected, value));
}

async function eventAlreadyHandled(env, eventId) {
  if (!eventId) return false;
  const row = await env.DB.prepare('SELECT event_id FROM stripe_membership_events WHERE event_id = ?').bind(eventId).first();
  return Boolean(row);
}

async function recordEvent(env, event) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO stripe_membership_events (event_id, event_type, received_at)
    VALUES (?, ?, ?)
  `).bind(event.id, event.type || 'unknown', Date.now()).run();
}

async function handleStripeWebhook(request, env) {
  await ensureSchema(env);
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ ok: false, error: 'STRIPE_WEBHOOK_SECRET is not configured' }, 503);
  }
  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  const valid = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, rawBody, signature).catch(() => false);
  if (!valid) return json({ ok: false, error: 'Invalid Stripe signature' }, 400);

  let event;
  try { event = JSON.parse(rawBody || '{}'); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  if (!event?.id || !event?.type) return json({ ok: false, error: 'Invalid Stripe event' }, 400);
  if (await eventAlreadyHandled(env, event.id)) return json({ ok: true, duplicate: true });

  const object = event?.data?.object || {};
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await updateFromCheckout(env, object, false);
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await updateFromCheckout(env, object, true);
  } else if (event.type === 'invoice.paid') {
    await updateFromInvoice(env, object, true);
  } else if (event.type === 'invoice.payment_failed') {
    await updateFromInvoice(env, object, false);
  } else if (event.type === 'customer.subscription.updated') {
    await updateFromSubscription(env, object, false);
  } else if (event.type === 'customer.subscription.deleted') {
    await updateFromSubscription(env, object, true);
  }

  await recordEvent(env, event);
  return json({ ok: true, received: event.type });
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function verifyLineSignature(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, bytesFromBase64(signature), new TextEncoder().encode(rawBody));
}

async function lineRequest(env, endpoint, body) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  const response = await fetch(`${LINE_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `LINE HTTP ${response.status}`);
  return payload;
}

async function replyLine(env, replyToken, text) {
  if (!replyToken || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  await lineRequest(env, 'reply', {
    replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 5000) }]
  });
}

function lineCommand(event) {
  if (event?.type !== 'message' || event?.message?.type !== 'text') return '';
  return String(event.message.text || '').trim();
}

async function activeMembershipForLine(env, userId) {
  await ensureSchema(env);
  return env.DB.prepare(`
    SELECT * FROM paid_memberships
    WHERE line_user_id = ? AND status = 'ACTIVE'
    ORDER BY activated_at DESC LIMIT 1
  `).bind(userId).first();
}

async function legacySubscriberActive(env, userId) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT active FROM line_subscribers WHERE user_id = ?').bind(userId).first();
  return Number(row?.active || 0) === 1;
}

async function activateByCode(env, userId, rawCode) {
  await ensureSchema(env);
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return { ok: false, reason: 'missing_code' };
  const row = await env.DB.prepare('SELECT * FROM paid_memberships WHERE activation_code = ?').bind(code).first();
  if (!row) return { ok: false, reason: 'invalid_code' };
  if (!['PAID', 'ACTIVE'].includes(String(row.status))) return { ok: false, reason: 'not_paid', status: row.status };
  if (row.line_user_id && row.line_user_id !== userId) return { ok: false, reason: 'already_linked' };

  const linked = await env.DB.prepare(`
    SELECT activation_id FROM paid_memberships
    WHERE line_user_id = ? AND activation_id <> ? AND status = 'ACTIVE'
    LIMIT 1
  `).bind(userId, row.activation_id).first();
  if (linked) return { ok: false, reason: 'line_already_linked' };

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE paid_memberships
    SET line_user_id = ?, status = 'ACTIVE', activated_at = COALESCE(activated_at, ?), updated_at = ?
    WHERE activation_id = ?
  `).bind(userId, now, now, row.activation_id).run();
  await setSubscriber(env, userId, true, now);
  return { ok: true, membership: await membershipByActivation(env, row.activation_id) };
}

async function handlePaidLineWebhook(request, env) {
  await ensureSchema(env);
  if (!env.LINE_CHANNEL_SECRET) return json({ ok: false, error: 'LINE_CHANNEL_SECRET is not configured' }, 503);
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') || '';
  const valid = await verifyLineSignature(env.LINE_CHANNEL_SECRET, rawBody, signature).catch(() => false);
  if (!valid) return json({ ok: false, error: 'Invalid LINE signature' }, 401);

  let body;
  try { body = JSON.parse(rawBody || '{}'); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  for (const event of Array.isArray(body.events) ? body.events : []) {
    const userId = event?.source?.userId;
    if (!userId) continue;

    if (event.type === 'unfollow') {
      await setSubscriber(env, userId, false).catch(() => null);
      continue;
    }

    if (event.type === 'follow') {
      const active = await activeMembershipForLine(env, userId);
      if (active) {
        await setSubscriber(env, userId, true, Number(active.activated_at || Date.now()));
        await replyLine(env, event.replyToken, '✅ NOMADTIPS3 LINE Alert พร้อมใช้งานแล้ว');
      } else {
        await setSubscriber(env, userId, false).catch(() => null);
        await replyLine(env, event.replyToken, 'ยินดีต้อนรับสู่ NOMADTIPS3\nหลังชำระเงิน ให้ส่งรหัสจากหน้า Payment Successful ในแชทนี้ เช่น ACTIVATE ABCD1234');
      }
      continue;
    }

    const command = lineCommand(event);
    const activationMatch = command.match(/^\s*(?:activate|เปิดใช้งาน|ยืนยัน)\s*[-:#]?\s*([a-z0-9]{6,16})\s*$/i);
    if (activationMatch) {
      const result = await activateByCode(env, userId, activationMatch[1]);
      if (result.ok) {
        await replyLine(env, event.replyToken, '✅ เปิดใช้งานสำเร็จ\nบัญชี LINE นี้เชื่อมกับสมาชิกที่ชำระเงินแล้ว และจะรับ NOMADTIPS3 Live Alerts อัตโนมัติ');
      } else if (result.reason === 'not_paid') {
        await replyLine(env, event.replyToken, '⏳ ยังไม่พบการยืนยันการชำระเงินของรหัสนี้ กรุณารอสักครู่แล้วส่งรหัสเดิมอีกครั้ง');
      } else if (['already_linked', 'line_already_linked'].includes(result.reason)) {
        await replyLine(env, event.replyToken, '⚠️ รหัสหรือ LINE นี้ถูกเชื่อมกับสมาชิกอื่นแล้ว กรุณาติดต่อ Support');
      } else {
        await replyLine(env, event.replyToken, '❌ รหัสเปิดใช้งานไม่ถูกต้อง กรุณาใช้รหัสจากหน้า Payment Successful');
      }
      continue;
    }

    if (/^(status|สถานะ)$/i.test(command)) {
      const active = await activeMembershipForLine(env, userId);
      const legacyActive = active ? true : await legacySubscriberActive(env, userId);
      await replyLine(env, event.replyToken, legacyActive
        ? '🟢 NOMADTIPS3 LINE Alert: ACTIVE'
        : '⚪ NOMADTIPS3 LINE Alert: NOT ACTIVE\nชำระเงินจากหน้า Monitor แล้วส่ง ACTIVATE + รหัสจากหน้า Payment Successful');
      continue;
    }

    if (/^(start|subscribe|เปิด|เปิดแจ้งเตือน)$/i.test(command)) {
      const active = await activeMembershipForLine(env, userId);
      const legacyActive = active ? true : await legacySubscriberActive(env, userId);
      if (active || legacyActive) {
        if (active) await setSubscriber(env, userId, true, Number(active.activated_at || Date.now()));
        await replyLine(env, event.replyToken, '✅ NOMADTIPS3 LINE Alert: ACTIVE');
      } else {
        await setSubscriber(env, userId, false).catch(() => null);
        await replyLine(env, event.replyToken, '🔒 ต้องยืนยันการชำระเงินก่อนเปิด Alert\nกลับไปที่หน้า Monitor → GET LINE ALERTS → ชำระเงิน → ส่ง ACTIVATE + รหัสที่ได้รับ');
      }
    }
  }
  return json({ ok: true });
}

function successPage(row, env) {
  const membership = publicMembership(row);
  const lineUrl = safeLineUrl(env);
  const status = membership?.status || 'UNKNOWN';
  const paid = ['PAID', 'ACTIVE'].includes(status);
  const active = status === 'ACTIVE';
  const code = membership?.activationCode || '—';
  const lineButton = lineUrl
    ? `<a class="primary" href="${lineUrl}" target="_blank" rel="noopener noreferrer">ADD / OPEN LINE</a>`
    : `<button class="primary" type="button" onclick="copyCommand(this)">COPY ACTIVATION COMMAND</button>`;
  const statusText = active ? 'ACTIVE' : (paid ? 'PAYMENT CONFIRMED' : 'VERIFYING PAYMENT');
  const nextText = active
    ? 'LINE is connected. Live alerts are enabled.'
    : (paid ? 'Add/Open LINE, then send the activation command shown below.' : 'Stripe is confirming your payment. This page updates automatically.');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07100b"><title>NOMADTIPS3 — Activate LINE</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#050706;color:#f3f7f4;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);background:#0b110d;border:1px solid #26342a;border-radius:18px;padding:28px;box-shadow:0 20px 60px #0008}.brand{font-weight:900;letter-spacing:.4px;font-size:22px}.brand b{color:#f3d41c}.badge{display:inline-flex;margin:24px 0 10px;padding:7px 11px;border-radius:999px;background:#122819;color:#6ee7a1;font-weight:800;font-size:12px;letter-spacing:.08em}.badge.wait{background:#2a2410;color:#f3d86b}h1{font-size:30px;margin:4px 0 8px}p{color:#afbbb2;margin:0 0 18px}.code{background:#050806;border:1px dashed #506a57;border-radius:14px;padding:18px;text-align:center;margin:20px 0}.code small{display:block;color:#8b998e;margin-bottom:7px}.code b{font:800 25px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}.command{font:700 16px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#dfe8e1;margin-top:12px;word-break:break-all}.primary{display:block;width:100%;border:0;border-radius:12px;padding:14px 16px;background:#15c66f;color:#031208;text-align:center;font-weight:900;text-decoration:none;cursor:pointer;font-size:16px}.secondary{display:block;text-align:center;margin-top:14px;color:#9eaaa1;text-decoration:none}.steps{margin:20px 0 0;padding-left:20px;color:#c8d0ca}.steps li{margin:7px 0}.tiny{font-size:12px;color:#718078;margin-top:18px}.ok{color:#6ee7a1}
</style></head><body><main class="card"><div class="brand">nomad<b>tips3</b></div><div id="badge" class="badge${paid ? '' : ' wait'}">${statusText}</div><h1 id="title">${active ? 'Activation complete' : 'Connect LINE'}</h1><p id="message">${nextText}</p>
<div class="code"><small>ACTIVATION CODE</small><b>${code}</b><div id="command" class="command">ACTIVATE ${code}</div></div>
${lineButton}
<ol class="steps"><li>Payment must show <b>PAYMENT CONFIRMED</b>.</li><li>Add/Open the NOMADTIPS3 LINE Official Account.</li><li>Send <b>ACTIVATE ${code}</b> in the chat.</li><li>LINE replies <b class="ok">เปิดใช้งานสำเร็จ</b> when linked.</li></ol>
<a class="secondary" href="https://www.nomadtips3.com/">Back to NOMADTIPS3</a><div class="tiny">No member dashboard. Payment and LINE entitlement are verified server-side.</div></main>
<script>
function copyCommand(button){navigator.clipboard?.writeText(document.getElementById('command').textContent).then(()=>{button.textContent='COPIED — OPEN LINE AND SEND';}).catch(()=>{});}
const activation=${JSON.stringify(membership?.activationId || '')};
const initialStatus=${JSON.stringify(status)};
if (activation && initialStatus !== 'ACTIVE') setInterval(async()=>{try{const r=await fetch('/membership/state?activation='+encodeURIComponent(activation),{cache:'no-store'});if(!r.ok)return;const d=await r.json();const next=d?.membership?.status;if((initialStatus!=='PAID'&&next==='PAID')||next==='ACTIVE')location.reload();}catch{}},3000);
</script></body></html>`;
}

async function handleMembershipStart(request, env) {
  const created = await createActivation(env);
  const link = new URL(paymentLink(env));
  link.searchParams.set('client_reference_id', created.activationId);
  return redirect(link.toString(), { 'Set-Cookie': activationCookie(created.activationId) });
}

async function handleMembershipSuccess(request, env, url) {
  const activation = getActivationFromRequest(request, url);
  const row = await membershipByActivation(env, activation);
  if (!row) {
    return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOMADTIPS3</title><body style="font-family:system-ui;background:#050706;color:white;padding:32px"><h1>Activation session not found</h1><p>Please return to the Monitor and start from GET LINE ALERTS.</p></body>`, 404);
  }
  return html(successPage(row, env), 200, { 'Set-Cookie': activationCookie(row.activation_id) });
}

async function handleMembershipState(request, env, url) {
  const activation = getActivationFromRequest(request, url);
  const row = await membershipByActivation(env, activation);
  return row ? json({ ok: true, membership: publicMembership(row) }) : json({ ok: false, error: 'Activation not found' }, 404);
}

async function handleMembershipHealth(env) {
  await ensureSchema(env);
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status IN ('PAST_DUE','CANCELED','FAILED') THEN 1 ELSE 0 END) AS blocked
    FROM paid_memberships
  `).first();
  return json({
    ok: true,
    service: 'nomadtips3-line-membership',
    stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    lineConfigured: Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN),
    lineAddFriendConfigured: Boolean(safeLineUrl(env)),
    paymentLinkConfigured: Boolean(paymentLink(env)),
    memberships: {
      total: Number(counts?.total || 0),
      paid: Number(counts?.paid || 0),
      active: Number(counts?.active || 0),
      blocked: Number(counts?.blocked || 0)
    },
    generatedAt: new Date().toISOString()
  });
}

export async function handleMembershipRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['/membership/start','/membership/success','/membership/state','/membership/health','/stripe-webhook','/line-webhook'].includes(path)) return null;
  try {
    if (path === '/membership/start' && request.method === 'GET') return handleMembershipStart(request, env);
    if (path === '/membership/success' && request.method === 'GET') return handleMembershipSuccess(request, env, url);
    if (path === '/membership/state' && request.method === 'GET') return handleMembershipState(request, env, url);
    if (path === '/membership/health' && request.method === 'GET') return handleMembershipHealth(env);
    if (path === '/stripe-webhook' && request.method === 'POST') return handleStripeWebhook(request, env);
    if (path === '/line-webhook' && request.method === 'POST') return handlePaidLineWebhook(request, env);
    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Membership route failed' }, 500);
  }
}

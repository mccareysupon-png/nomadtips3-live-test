import { handleMembershipRoute as handleCoreMembershipRoute } from './membership.js';

const DEFAULT_LINE_ADD_FRIEND_URL = 'https://line.me/R/ti/p/@448aadgo';
const PAYMENT_RECOVERY_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'customer.subscription.updated'
]);

function setupPage() {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050706"><title>NOMADTIPS3 — LINE Alerts</title></head>
<body style="margin:0;background:#050706;color:#f3f7f4;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box">
<main style="width:min(560px,100%);background:#0b110d;border:1px solid #26342a;border-radius:18px;padding:28px;box-sizing:border-box">
<div style="font-weight:900;font-size:22px">nomad<span style="color:#f3d41c">tips3</span></div>
<h1>LINE Alerts are being prepared</h1>
<p style="color:#afbbb2">Payment is temporarily locked until automatic Stripe and LINE verification are fully connected. No payment has been taken.</p>
<a href="https://www.nomadtips3.com/" style="color:#6ee7a1">Back to NOMADTIPS3</a>
</main></body></html>`, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function checkoutReady(env) {
  return Boolean(
    env.DB &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.LINE_CHANNEL_SECRET &&
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

function stripeIds(object = {}) {
  const subscription = object.subscription ||
    object?.parent?.subscription_details?.subscription ||
    (String(object.id || '').startsWith('sub_') ? object.id : null);
  const customer = typeof object.customer === 'string'
    ? object.customer
    : object?.customer?.id || null;
  return { subscription, customer };
}

async function restoreLineIfEntitled(event, env) {
  if (!env.DB || !PAYMENT_RECOVERY_EVENTS.has(String(event?.type || ''))) return;
  const object = event?.data?.object || {};
  const { subscription, customer } = stripeIds(object);
  let row = null;

  if (subscription) {
    row = await env.DB.prepare(`
      SELECT * FROM paid_memberships
      WHERE stripe_subscription_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(subscription).first();
  }
  if (!row && customer) {
    row = await env.DB.prepare(`
      SELECT * FROM paid_memberships
      WHERE stripe_customer_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(customer).first();
  }
  if (!row || String(row.status) !== 'ACTIVE' || !row.line_user_id) return;

  const now = Date.now();
  const subscribedAt = Number(row.activated_at || row.paid_at || now);
  await env.DB.prepare(`
    INSERT INTO line_subscribers (user_id, active, subscribed_at, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      active = 1,
      updated_at = excluded.updated_at
  `).bind(row.line_user_id, subscribedAt, now).run();
}

export async function handleMembershipRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/membership/start' && request.method === 'GET' && !checkoutReady(env)) {
    return setupPage();
  }

  const configuredEnv = {
    ...env,
    LINE_ADD_FRIEND_URL: env.LINE_ADD_FRIEND_URL || DEFAULT_LINE_ADD_FRIEND_URL
  };

  const isStripeWebhook = url.pathname === '/stripe-webhook' && request.method === 'POST';
  const recoveryCopy = isStripeWebhook ? request.clone() : null;
  const response = await handleCoreMembershipRoute(request, configuredEnv);

  if (recoveryCopy && response?.ok) {
    try {
      const event = await recoveryCopy.json();
      await restoreLineIfEntitled(event, configuredEnv);
    } catch {
      // Core webhook verification remains the source of truth. Recovery is best-effort only.
    }
  }
  return response;
}

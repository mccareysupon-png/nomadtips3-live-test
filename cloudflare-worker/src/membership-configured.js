import { handleMembershipRoute as handleCoreMembershipRoute } from './membership.js';

const DEFAULT_LINE_ADD_FRIEND_URL = 'https://line.me/R/ti/p/@448aadgo';

function setupPage() {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050706"><title>NOMADTIPS3 — LINE Alerts</title></head>
<body style="margin:0;background:#050706;color:#f3f7f4;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box">
<main style="width:min(560px,100%);background:#0b110d;border:1px solid #26342a;border-radius:18px;padding:28px;box-sizing:border-box">
<div style="font-weight:900;font-size:22px">nomad<span style="color:#f3d41c">tips3</span></div>
<h1>LINE Alerts are being prepared</h1>
<p style="color:#afbbb2">Payment is temporarily locked until automatic Stripe verification is fully connected. No payment has been taken.</p>
<a href="https://www.nomadtips3.com/" style="color:#6ee7a1">Back to NOMADTIPS3</a>
</main></body></html>`, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function handleMembershipRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/membership/start' && request.method === 'GET' && !env.STRIPE_WEBHOOK_SECRET) {
    return setupPage();
  }

  const configuredEnv = {
    ...env,
    LINE_ADD_FRIEND_URL: env.LINE_ADD_FRIEND_URL || DEFAULT_LINE_ADD_FRIEND_URL
  };
  return handleCoreMembershipRoute(request, configuredEnv);
}

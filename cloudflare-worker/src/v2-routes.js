import {\n  ensureV2Schema,
  readLatestState,
  readOwnerAnalytics,
  readOwnerConfig,
  writeLatestState,\n  writeOwnerConfig\n} from './v2-storage.js';\n\nconst ALLOWED_ORIGINS = new Set([\n  'https://nomadtips3.com',\n  'https://www.nomadtips3.com',\n  'https://mccareysupon-png.github.io'\n]);\nconst MAX_INGEST_BYTES = 1_500_000;\nconst DEFAULT_OWNER_HOST = 'bot-owner.nomadtips3.com';\n\nfunction corsHeaders(request) {\n  const origin = request.headers.get('Origin') || '';\n  return {\n    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)\n      ? origin\n      : 'https://www.nomadtips3.com',\n    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',\n    'Access-Control-Allow-Headers': 'Content-Type, Authorization',\n    'Access-Control-Allow-Credentials': 'true',\n    'Access-Control-Max-Age': '86400',\n    'Vary': 'Origin'\n  };\n}\n\nfunction reply(request, body, status = 200) {\n  return new Response(JSON.stringify(body, null, 2), {\n    status,\n    headers: {\n      'Content-Type': 'application/json; charset=utf-8',\n      'Cache-Control': 'no-store',\n      ...corsHeaders(request)\n    }\n  });\n}\n\nfunction bearer(request) {\n  const value = request.headers.get('Authorization') || '';\n  return value.startsWith('Bearer ') ? value.slice(7) : '';\n}\n\nfunction authorized(request, secret) {
  if (!secret) return false;\n  return bearer(request) === String(secret);\n}

function decodeBase64(value) {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function signedCollectorAuthorized(request, env, now = Date.now()) {
  const publicKeyBytes = decodeBase64(env.V2_COLLECTOR_PUBLIC_KEY_B64);
  const signature = decodeBase64(request.headers.get('X-Nomad-Signature'));
  const timestampText = request.headers.get('X-Nomad-Timestamp') || '';
  const nonce = request.headers.get('X-Nomad-Nonce') || '';
  const timestamp = Number(timestampText);
  if (!publicKeyBytes || publicKeyBytes.length !== 32 || !signature || signature.length !== 64) return false;
  if (!/^[a-f0-9]{32}$/i.test(nonce) || !Number.isInteger(timestamp)) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > 180) return false;

  const body = await request.clone().arrayBuffer();
  const path = new URL(request.url).pathname || '/';
  const canonical = `${request.method.toUpperCase()}\n${path}\n${timestampText}\n${nonce}\n${await sha256Hex(body)}`;
  const key = await crypto.subtle.importKey(
    'raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' }, key, signature, new TextEncoder().encode(canonical)
  );
  if (!valid) return false;

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO v2_auth_nonce (nonce, expires_at, created_at)
    VALUES (?, ?, ?)
  `).bind(nonce, now + 5 * 60_000, now).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return false;
  await env.DB.prepare('DELETE FROM v2_auth_nonce WHERE expires_at < ?')
    .bind(now).run().catch(() => null);
  return true;
}

async function collectorAuthorized(request, env) {
  if (authorized(request, env.V2_INGEST_SECRET)) return true;
  try { return await signedCollectorAuthorized(request, env); } catch { return false; }
}
\nfunction hasAccessSession(request) {\n  const cookie = request.headers.get('Cookie') || '';\n  return /(?:^|;\s*)CF_Authorization=[^;]+/i.test(cookie);\n}\n\nfunction ownerAuthorized(request, env) {\n  const url = new URL(request.url);\n  const ownerHost = String(env.V2_OWNER_HOST || DEFAULT_OWNER_HOST).trim().toLowerCase();\n  const requestHost = url.hostname.trim().toLowerCase();\n\n  // The owner hostname is protected by Cloudflare Access. Access blocks requests\n  // before they reach this Worker and issues CF_Authorization to authenticated users.\n  if (requestHost === ownerHost && hasAccessSession(request)) return true;\n\n  // Keep the identity-header check for Access setups that inject email headers.\n  const allowedEmail = String(env.V2_OWNER_EMAIL || '').trim().toLowerCase();\n  const accessEmail = String(\n    request.headers.get('Cf-Access-Authenticated-User-Email') || ''\n  ).trim().toLowerCase();\n  if (allowedEmail && accessEmail && accessEmail === allowedEmail) return true;\n\n  // Optional trusted internal fallback. Never expose this secret in browser code.\n  return authorized(request, env.V2_OWNER_SECRET);\n}\n\nasync function readJson(request, maxBytes = MAX_INGEST_BYTES) {\n  const length = Number(request.headers.get('Content-Length') || 0);\n  if (length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');\n  const text = await request.text();\n  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');\n  return text ? JSON.parse(text) : {};\n}\n\nfunction validEnvelope(value) {\n  if (!value || typeof value !== 'object') return false;\n  if (!value.payload || typeof value.payload !== 'object') return false;\n  if (!/^[a-f0-9]{64}$/i.test(String(value.state_hash || ''))) return false;\n  if (!String(value.collector_id || '').trim()) return false;\n  return String(value.payload.schema || '').startsWith('nomadtips3.live.v2.');\n}\n\nfunction publicPayload(latest) {\n  if (!latest?.payload) return latest;\n  const source = latest.payload;\n  return {\n    generatedAt: latest.generatedAt,\n    ingestedAt: latest.ingestedAt,\n    collectorId: latest.collectorId,\n    liveCount: latest.liveCount,\n    candidateCount: latest.candidateCount,\n    statisticsFixtureCount: latest.statisticsFixtureCount,\n    liveOddsFixtureCount: latest.liveOddsFixtureCount,\n    stateHash: latest.stateHash,\n    payload: {\n      schema: source.schema,\n      generated_at: source.generated_at,\n      live_count: source.live_count,\n      preliminary_candidate_count: source.preliminary_candidate_count,\n      statistics_fixture_count: source.statistics_fixture_count,\n      live_odds_fixture_count: source.live_odds_fixture_count,\n      fixtures: source.fixtures || [],\n      preliminary_candidates: source.preliminary_candidates || [],\n      statistics: source.statistics || {},\n      live_odds: source.live_odds || {}\n    }\n  };\n}\n\nexport async function handleV2Route(request, env) {\n  const url = new URL(request.url);\n  if (!url.pathname.startsWith('/v2/')) return null;\n\n  if (request.method === 'OPTIONS') {\n    return new Response(null, { status: 204, headers: corsHeaders(request) });\n  }\n\n  await ensureV2Schema(env);\n\n  if (url.pathname === '/v2/ingest') {\n    if (request.method !== 'POST') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);\n    if (!(await collectorAuthorized(request, env))) {
      return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);\n    }\n    try {\n      const envelope = await readJson(request);\n      if (!validEnvelope(envelope)) return reply(request, { ok: false, error: 'INVALID_ENVELOPE' }, 400);\n      await writeLatestState(env, envelope);\n      return reply(request, {\n        ok: true,\n        accepted: true,\n        collectorId: envelope.collector_id,\n        stateHash: envelope.state_hash,\n        receivedAt: new Date().toISOString()\n      });\n    } catch (error) {\n      const message = error?.message || 'INGEST_FAILED';\n      return reply(request, { ok: false, error: message }, message === 'PAYLOAD_TOO_LARGE' ? 413 : 400);\n    }\n  }\n\n  if (url.pathname === '/v2/collector/config') {\n    if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);\n    if (!(await collectorAuthorized(request, env))) {
      return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);\n    }\n    return reply(request, { ok: true, ownerConfig: await readOwnerConfig(env) });\n  }\n\n  if (url.pathname === '/v2/state') {
    if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);\n    const latest = await readLatestState(env);\n    return reply(request, { ok: true, state: latest ? publicPayload(latest) : null });\n  }

  if (url.pathname === '/v2/owner/status') {
    if (!ownerAuthorized(request, env)) return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);
    if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    return reply(request, {
      ok: true,
      state: await readLatestState(env),
      ownerConfig: await readOwnerConfig(env),
      generatedAt: new Date().toISOString()
    });
  }

  if (url.pathname === '/v2/owner/analytics') {
    if (!ownerAuthorized(request, env)) return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);
    if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    return reply(request, {
      ok: true,
      analytics: await readOwnerAnalytics(env, url.searchParams.get('days') || 30),
    });
  }

  if (url.pathname === '/v2/owner/config') {
    if (!ownerAuthorized(request, env)) return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);\n\n    if (request.method === 'GET') {\n      return reply(request, { ok: true, ownerConfig: await readOwnerConfig(env) });\n    }\n\n    if (request.method === 'PUT') {\n      try {\n        const body = await readJson(request, 100_000);\n        const result = await writeOwnerConfig(env, body.config || {}, body.expectedVersion ?? null, 'owner');\n        if (result.conflict) return reply(request, { ok: false, error: 'VERSION_CONFLICT', current: result.current }, 409);\n        return reply(request, { ok: true, ownerConfig: result });\n      } catch (error) {\n        return reply(request, { ok: false, error: error?.message || 'CONFIG_WRITE_FAILED' }, 400);\n      }\n    }\n\n    return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);\n  }\n\n  return reply(request, { ok: false, error: 'NOT_FOUND' }, 404);\n}\n
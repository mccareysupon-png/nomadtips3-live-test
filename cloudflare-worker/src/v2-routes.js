import {
  ensureV2Schema,
  readLatestState,
  readOwnerConfig,
  writeLatestState,
  writeOwnerConfig
} from './v2-storage.js';

const ALLOWED_ORIGINS = new Set([
  'https://nomadtips3.com',
  'https://www.nomadtips3.com',
  'https://mccareysupon-png.github.io'
]);
const MAX_INGEST_BYTES = 1_500_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://www.nomadtips3.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(request, body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function authorized(request, secret) {
  if (!secret) return false;
  return bearer(request) === String(secret);
}

function ownerAuthorized(request, env) {
  const allowedEmail = String(env.V2_OWNER_EMAIL || '').trim().toLowerCase();
  const accessEmail = String(
    request.headers.get('Cf-Access-Authenticated-User-Email') || ''
  ).trim().toLowerCase();

  if (allowedEmail && accessEmail && accessEmail === allowedEmail) return true;

  // Optional non-browser fallback for trusted internal tools only.
  return authorized(request, env.V2_OWNER_SECRET);
}

async function readJson(request, maxBytes = MAX_INGEST_BYTES) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  return text ? JSON.parse(text) : {};
}

function validEnvelope(value) {
  if (!value || typeof value !== 'object') return false;
  if (!value.payload || typeof value.payload !== 'object') return false;
  if (!/^[a-f0-9]{64}$/i.test(String(value.state_hash || ''))) return false;
  if (!String(value.collector_id || '').trim()) return false;
  return String(value.payload.schema || '').startsWith('nomadtips3.live.v2.');
}

function publicPayload(latest) {
  if (!latest?.payload) return latest;
  const source = latest.payload;
  return {
    generatedAt: latest.generatedAt,
    ingestedAt: latest.ingestedAt,
    collectorId: latest.collectorId,
    liveCount: latest.liveCount,
    candidateCount: latest.candidateCount,
    statisticsFixtureCount: latest.statisticsFixtureCount,
    liveOddsFixtureCount: latest.liveOddsFixtureCount,
    stateHash: latest.stateHash,
    payload: {
      schema: source.schema,
      generated_at: source.generated_at,
      live_count: source.live_count,
      preliminary_candidate_count: source.preliminary_candidate_count,
      statistics_fixture_count: source.statistics_fixture_count,
      live_odds_fixture_count: source.live_odds_fixture_count,
      fixtures: source.fixtures || [],
      preliminary_candidates: source.preliminary_candidates || [],
      statistics: source.statistics || {},
      live_odds: source.live_odds || {}
    }
  };
}

export async function handleV2Route(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v2/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  await ensureV2Schema(env);

  if (url.pathname === '/v2/ingest') {
    if (request.method !== 'POST') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!authorized(request, env.V2_INGEST_SECRET)) {
      return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);
    }
    try {
      const envelope = await readJson(request);
      if (!validEnvelope(envelope)) return reply(request, { ok: false, error: 'INVALID_ENVELOPE' }, 400);
      await writeLatestState(env, envelope);
      return reply(request, {
        ok: true,
        accepted: true,
        collectorId: envelope.collector_id,
        stateHash: envelope.state_hash,
        receivedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = error?.message || 'INGEST_FAILED';
      return reply(request, { ok: false, error: message }, message === 'PAYLOAD_TOO_LARGE' ? 413 : 400);
    }
  }

  if (url.pathname === '/v2/state') {
    if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    const latest = await readLatestState(env);
    return reply(request, { ok: true, state: latest ? publicPayload(latest) : null });
  }

  if (url.pathname === '/v2/owner/config') {
    if (!ownerAuthorized(request, env)) return reply(request, { ok: false, error: 'UNAUTHORIZED' }, 401);

    if (request.method === 'GET') {
      return reply(request, { ok: true, ownerConfig: await readOwnerConfig(env) });
    }

    if (request.method === 'PUT') {
      try {
        const body = await readJson(request, 100_000);
        const result = await writeOwnerConfig(env, body.config || {}, body.expectedVersion ?? null, 'owner');
        if (result.conflict) return reply(request, { ok: false, error: 'VERSION_CONFLICT', current: result.current }, 409);
        return reply(request, { ok: true, ownerConfig: result });
      } catch (error) {
        return reply(request, { ok: false, error: error?.message || 'CONFIG_WRITE_FAILED' }, 400);
      }
    }

    return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  return reply(request, { ok: false, error: 'NOT_FOUND' }, 404);
}

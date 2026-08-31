import baseWorker from './index.js';
import { ODDSTORM_BOOKMAKERS, oddStormHealth, refereeOddStorm } from './oddstorm-referee.js';

function responseJson(payload, baseResponse) {
  const headers = new Headers(baseResponse.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), { status: baseResponse.status, headers });
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

function clientIdOf(item) {
  return String(item?.clientId ?? item?.id ?? '');
}

async function enrichQuotes(request, env, ctx) {
  let requestBody = null;
  try { requestBody = await request.clone().json(); } catch {}

  const baseResponse = await baseWorker.fetch(request, env, ctx);
  const payload = await readJson(baseResponse.clone());
  if (!payload || !Array.isArray(payload.results)) return baseResponse;

  const targets = new Map((Array.isArray(requestBody?.matches) ? requestBody.matches : []).map(item => [clientIdOf(item), item]));
  await Promise.all(payload.results.map(async result => {
    const market = result?.market;
    if (market?.status !== 'AH READY') {
      result.referee = {
        source: 'OddStorm',
        role: 'additional-price-referee',
        failOpen: true,
        selectedBookmakers: ODDSTORM_BOOKMAKERS,
        status: 'NOT_NEEDED',
        decision: 'SKIP',
        reason: 'primary_market_not_ready',
      };
      return;
    }

    const target = targets.get(String(result?.clientId ?? ''));
    if (!target) {
      result.referee = {
        source: 'OddStorm',
        role: 'additional-price-referee',
        failOpen: true,
        selectedBookmakers: ODDSTORM_BOOKMAKERS,
        status: 'MAPPING_MISS',
        decision: 'SKIP',
        reason: 'client_target_missing',
      };
      return;
    }

    const referee = await refereeOddStorm(target, market, env);
    result.referee = referee;

    if (referee?.decision === 'REJECT') {
      result.primaryMarket = market;
      result.market = {
        ...market,
        status: 'AH UNAVAILABLE',
        reason: 'oddstorm_referee_reject',
        sourceUpdatedAt: null,
        refereeRejected: true,
      };
    }
  }));

  payload.referee = oddStormHealth(env);
  return responseJson(payload, baseResponse);
}

async function enrichInfo(request, env, ctx) {
  const baseResponse = await baseWorker.fetch(request, env, ctx);
  const payload = await readJson(baseResponse.clone());
  if (!payload || typeof payload !== 'object') return baseResponse;
  payload.oddStormReferee = oddStormHealth(env);
  return responseJson(payload, baseResponse);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/quotes' && request.method === 'POST') return enrichQuotes(request, env, ctx);
    if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return enrichInfo(request, env, ctx);
    return baseWorker.fetch(request, env, ctx);
  },
};

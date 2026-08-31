import { ODDSTORM_BOOKMAKERS, oddStormHealth, refereeOddStorm } from './oddstorm-referee.js';

const PRIMARY_BASE = 'https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';

function responseJson(payload, baseResponse) {
  const headers = new Headers(baseResponse?.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,x-s8-adapter-token');
  return new Response(JSON.stringify(payload), { status: baseResponse?.status || 200, headers });
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

function clientIdOf(item) {
  return String(item?.clientId ?? item?.id ?? '');
}

async function primaryFetch(request) {
  const sourceUrl = new URL(request.url);
  const target = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, PRIMARY_BASE);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'x-s8-adapter-token']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
    cache: 'no-store',
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.clone().arrayBuffer();
  return fetch(target.toString(), init);
}

function gatewayFailure(error) {
  return responseJson({
    ok: false,
    service: 'nomadtips3-oddstorm-referee',
    error: `primary_gateway_failed:${String(error?.message || error || 'unknown')}`,
    failOpenAtClient: true,
    oddStormReferee: oddStormHealth(),
  }, { status: 502, headers: new Headers() });
}

async function enrichQuotes(request, env) {
  let requestBody = null;
  try { requestBody = await request.clone().json(); } catch {}

  let baseResponse;
  try { baseResponse = await primaryFetch(request); } catch (error) { return gatewayFailure(error); }
  const payload = await readJson(baseResponse.clone());
  if (!payload || !Array.isArray(payload.results)) return baseResponse;

  const targets = new Map((Array.isArray(requestBody?.matches) ? requestBody.matches : []).map(item => [clientIdOf(item), item]));
  await Promise.all(payload.results.map(async result => {
    const market = result?.market;
    if (market?.status !== 'AH READY') {
      result.referee = {
        source: 'OddStorm', role: 'additional-price-referee', failOpen: true,
        selectedBookmakers: ODDSTORM_BOOKMAKERS, status: 'NOT_NEEDED', decision: 'SKIP',
        reason: 'primary_market_not_ready',
      };
      return;
    }

    const target = targets.get(String(result?.clientId ?? ''));
    if (!target) {
      result.referee = {
        source: 'OddStorm', role: 'additional-price-referee', failOpen: true,
        selectedBookmakers: ODDSTORM_BOOKMAKERS, status: 'MAPPING_MISS', decision: 'SKIP',
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

  payload.gateway = { service: 'nomadtips3-oddstorm-referee', primary: PRIMARY_BASE, failOpen: true };
  payload.referee = oddStormHealth(env);
  return responseJson(payload, baseResponse);
}

async function enrichInfo(request, env) {
  let baseResponse;
  try { baseResponse = await primaryFetch(request); } catch (error) { return gatewayFailure(error); }
  const payload = await readJson(baseResponse.clone());
  if (!payload || typeof payload !== 'object') return baseResponse;
  payload.gateway = { service: 'nomadtips3-oddstorm-referee', primary: PRIMARY_BASE, failOpen: true };
  payload.oddStormReferee = oddStormHealth(env);
  return responseJson(payload, baseResponse);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseJson({}, { headers: new Headers() }).headers });
    const url = new URL(request.url);
    if (url.pathname === '/quotes' && request.method === 'POST') return enrichQuotes(request, env);
    if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return enrichInfo(request, env);
    try { return await primaryFetch(request); } catch (error) { return gatewayFailure(error); }
  },
};

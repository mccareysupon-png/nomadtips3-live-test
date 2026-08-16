import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULTS,
  secondHalfFixtures,
  liveOddsByFixture,
  buildTargets,
  evaluateTarget,
  chunks,
} from './logic.js';

const API_BASE = 'https://v3.football.api-sports.io';
const STATE_NAME = 'car3-global';
const LINE_NOTIFICATIONS_ENABLED = false;

function cfg(env) {
  const n = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    ...DEFAULTS,
    minMinute: n(env.MIN_MINUTE, DEFAULTS.minMinute),
    maxMinute: n(env.MAX_MINUTE, DEFAULTS.maxMinute),
    liveBetId: n(env.LIVE_BET_ID, DEFAULTS.liveBetId),
    minOdds: n(env.MIN_ODDS, DEFAULTS.minOdds),
    minShotsOnGoal: n(env.MIN_SHOTS_ON_GOAL, DEFAULTS.minShotsOnGoal),
    minTotalShots: n(env.MIN_TOTAL_SHOTS, DEFAULTS.minTotalShots),
    minCorners: n(env.MIN_CORNERS, DEFAULTS.minCorners),
    minPossession: n(env.MIN_POSSESSION, DEFAULTS.minPossession),
  };
}

function stateStub(env) {
  return env.STATE.get(env.STATE.idFromName(STATE_NAME));
}

async function stateCall(env, path, body) {
  const response = await stateStub(env).fetch(`https://state${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`state_${response.status}`);
  return response.json();
}

function parseHeaderInt(headers, names) {
  for (const name of names) {
    const raw = headers.get(name);
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(env, path, params, meter) {
  if (!env.API_FOOTBALL_KEY) throw new Error('missing_API_FOOTBALL_KEY');
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    meter.requests += 1;
    let response;
    try {
      response = await fetch(url, {
        headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) { await sleep(700); continue; }
      throw error;
    }

    meter.remainingDay = parseHeaderInt(response.headers, [
      'x-ratelimit-requests-remaining', 'X-RateLimit-Requests-Remaining',
    ]) ?? meter.remainingDay;
    meter.remainingMinute = parseHeaderInt(response.headers, [
      'x-ratelimit-remaining', 'X-RateLimit-Remaining',
    ]) ?? meter.remainingMinute;

    if (response.status === 204) return [];
    if (response.status === 401 || response.status === 403) throw new Error(`api_auth_${response.status}`);
    if (response.status === 429 || response.status === 499 || response.status >= 500) {
      lastError = new Error(`api_retryable_${response.status}`);
      if (attempt === 0) {
        const retryAfter = Math.min(5, Math.max(1, Number(response.headers.get('Retry-After')) || 2));
        await sleep(retryAfter * 1000);
        continue;
      }
      throw lastError;
    }
    if (!response.ok) throw new Error(`api_http_${response.status}`);

    const payload = await response.json();
    if (payload?.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors).length)) {
      throw new Error(`api_errors:${JSON.stringify(payload.errors).slice(0, 300)}`);
    }
    return Array.isArray(payload?.response) ? payload.response : [];
  }
  throw lastError || new Error('api_unknown_error');
}

async function sendLine(env, text) {
  if (!LINE_NOTIFICATIONS_ENABLED) {
    return { ok: false, skipped: true, reason: 'disabled_by_owner' };
  }
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_TARGET_ID) {
    return { ok: false, skipped: true, reason: 'missing_line_secret' };
  }
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: env.LINE_TARGET_ID,
      messages: [{ type: 'text', text: String(text).slice(0, 4900) }],
    }),
  });
  const body = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: body.slice(0, 500) };
  return { ok: true, status: response.status };
}

function uniqueFixtureIds(targets) {
  return [...new Set(targets.map((x) => x.fixtureId))];
}

function indexDetails(rows) {
  return new Map((rows || []).map((row) => [Number(row?.fixture?.id), row]));
}

function alertText(alerts, cycle) {
  const lines = ['NOMADTIPS3 · CAR 3 PAPER ALERT'];
  for (const a of alerts) {
    lines.push(
      `${a.homeName} vs ${a.awayName}`,
      `Minute ${a.elapsed} · ${a.teamName} (${a.side}) · Odds ${a.odd}`,
      `SOG ${a.metrics.shotsOnGoal} | Shots ${a.metrics.totalShots} | Corners ${a.metrics.corners} | Poss ${a.metrics.possession}%`,
    );
  }
  lines.push(`API req ${cycle.apiRequests} · remaining/day ${cycle.remainingDay ?? 'N/A'}`, 'PAPER ONLY');
  return lines.join('\n');
}

async function runScan(env, source = 'cron') {
  const startedAt = Date.now();
  const config = cfg(env);
  const meter = { requests: 0, remainingDay: null, remainingMinute: null };
  const lock = await stateCall(env, '/lock', { ttlMs: 120000 });
  if (!lock.acquired) return { ok: false, skipped: 'locked' };

  let cycle;
  try {
    const liveFixtures = await apiGet(env, '/fixtures', { live: 'all' }, meter);
    const secondHalf = secondHalfFixtures(liveFixtures, config);

    let liveOdds = [];
    let targets = [];
    if (secondHalf.length > 0) {
      liveOdds = await apiGet(env, '/odds/live', { bet: config.liveBetId }, meter);
      targets = buildTargets(secondHalf, liveOddsByFixture(liveOdds, config.liveBetId), config);
    }

    const details = [];
    const fixtureIds = uniqueFixtureIds(targets);
    const idBatches = chunks(fixtureIds, 20);
    for (const idBatch of idBatches) {
      if (!idBatch.length) continue;
      const rows = await apiGet(env, '/fixtures', { ids: idBatch.join('-') }, meter);
      details.push(...rows);
      await sleep(180);
    }
    const byId = indexDetails(details);

    const evaluations = [];
    const matched = [];
    for (const target of targets) {
      const result = evaluateTarget(target, byId.get(target.fixtureId), config);
      const record = { ...target, ...result, at: Date.now() };
      evaluations.push(record);
      if (result.pass) matched.push(record);
    }

    const alertKeys = matched.map((a) => `${a.fixtureId}:${a.side}`);
    const seenState = await stateCall(env, '/seen', { keys: alertKeys });
    const newAlerts = matched.filter((_, i) => !seenState.seen[alertKeys[i]]);

    cycle = {
      ok: true,
      source,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      liveFixtures: liveFixtures.length,
      secondHalfFixtures: secondHalf.length,
      liveOddsFixtures: liveOdds.length,
      candidateTargets: targets.length,
      candidateFixtures: fixtureIds.length,
      detailBatches: idBatches.length,
      matched: matched.length,
      newAlerts: newAlerts.length,
      apiRequests: meter.requests,
      remainingDay: meter.remainingDay,
      remainingMinute: meter.remainingMinute,
    };

    const sentKeys = [];
    if (newAlerts.length) {
      const line = await sendLine(env, alertText(newAlerts, cycle));
      cycle.lineAlert = line;
      if (line.ok) sentKeys.push(...newAlerts.map((a) => `${a.fixtureId}:${a.side}`));
    }

    if (!seenState.healthNotified) {
      const health = await sendLine(
        env,
        `NOMADTIPS3 · CAR 3 ONLINE\nCloudflare Worker + Cron 10 min\nLive ${cycle.liveFixtures} | 2H ${cycle.secondHalfFixtures} | Candidates ${cycle.candidateFixtures}\nAPI req ${cycle.apiRequests} | remaining/day ${cycle.remainingDay ?? 'N/A'}\nPAPER ONLY`,
      );
      cycle.lineHealth = health;
      if (health.ok) cycle.markHealthNotified = true;
    }

    await stateCall(env, '/commit', {
      cycle,
      evaluations,
      sentKeys,
      markHealthNotified: cycle.markHealthNotified === true,
    });
    console.log(JSON.stringify({ event: 'car3_cycle', ...cycle }));
    return cycle;
  } catch (error) {
    cycle = {
      ok: false,
      source,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      error: String(error?.message || error),
      apiRequests: meter.requests,
      remainingDay: meter.remainingDay,
      remainingMinute: meter.remainingMinute,
    };
    try { await stateCall(env, '/commit', { cycle, evaluations: [], sentKeys: [], markHealthNotified: false }); } catch {}
    console.error(JSON.stringify({ event: 'car3_cycle_error', ...cycle }));
    return cycle;
  } finally {
    try { await stateCall(env, '/unlock', {}); } catch {}
  }
}

export class Car3State extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/lock') {
      const { ttlMs = 120000 } = await request.json();
      const now = Date.now();
      const until = Number(await this.ctx.storage.get('lockUntil') || 0);
      if (until > now) return Response.json({ acquired: false, until });
      const next = now + Math.max(10000, Math.min(Number(ttlMs) || 120000, 300000));
      await this.ctx.storage.put('lockUntil', next);
      return Response.json({ acquired: true, until: next });
    }
    if (request.method === 'POST' && url.pathname === '/unlock') {
      await this.ctx.storage.delete('lockUntil');
      return Response.json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/seen') {
      const { keys = [] } = await request.json();
      const seen = {};
      for (const key of keys) seen[key] = Boolean(await this.ctx.storage.get(`alert:${key}`));
      const healthNotified = Boolean(await this.ctx.storage.get('healthNotified'));
      return Response.json({ seen, healthNotified });
    }
    if (request.method === 'POST' && url.pathname === '/commit') {
      const body = await request.json();
      await this.ctx.storage.put('lastCycle', body.cycle || null);
      const current = (await this.ctx.storage.get('recentEvaluations')) || [];
      const next = [...current, ...(body.evaluations || [])].slice(-500);
      await this.ctx.storage.put('recentEvaluations', next);
      for (const key of body.sentKeys || []) await this.ctx.storage.put(`alert:${key}`, { at: Date.now() });
      if (body.markHealthNotified) await this.ctx.storage.put('healthNotified', true);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        lastCycle: (await this.ctx.storage.get('lastCycle')) || null,
        healthNotified: Boolean(await this.ctx.storage.get('healthNotified')),
        recentEvaluations: ((await this.ctx.storage.get('recentEvaluations')) || []).slice(-25),
      });
    }
    return new Response('Not found', { status: 404 });
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScan(env, `cron:${controller.cron}`));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      const state = await stateCall(env, '/health');
      return Response.json({
        service: 'NOMADTIPS3 CAR 3',
        mode: 'PAPER ONLY',
        engine: 'Cloudflare Worker V6',
        schedule: '*/10 * * * *',
        apiConfigured: Boolean(env.API_FOOTBALL_KEY),
        lineConfigured: LINE_NOTIFICATIONS_ENABLED && Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_TARGET_ID),
        lineNotifications: LINE_NOTIFICATIONS_ENABLED ? 'ON' : 'OFF',
        ...state,
      }, { headers: { 'cache-control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },
};

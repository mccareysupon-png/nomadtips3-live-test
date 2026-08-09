import paperEntry from './paper-entry.js';
import car3Scanner from './entry-batched.js';
import { handleAutoRequest, runAutoMomentumScan } from './auto-scan.js';
import { getSharedApiGuardStatus } from './shared-api-football.js';
import { runManagedCycle } from './managed-cycle.js';
import {
  WATCHDOG_INTERVAL_MS,
  getEngineControl,
  getEngineHealthRow,
  healthState,
  recordEngineAttempt,
  recordEngineFailure,
  recordEngineSuccess,
  recordRecovery,
  recordWatchdogCheck,
  setEngineMode,
  watchdogDue,
  watchdogPlan
} from './engine-control.js';

const ALLOWED_ORIGINS = new Set([
  'https://mccareysupon-png.github.io',
  'https://nomadtips3.com',
  'https://www.nomadtips3.com'
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://mccareysupon-png.github.io';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

async function autoStatusRow(env) {
  return env.DB.prepare('SELECT * FROM auto_scan_status WHERE id = 1').first().catch(() => null);
}

async function paperHealth(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
             MAX(updated_at) AS last_updated_at
      FROM paper_trades
    `).first();
    return {
      ok: true,
      total: Number(row?.total || 0),
      pending: Number(row?.pending || 0),
      lastUpdatedAt: Number(row?.last_updated_at || 0)
        ? new Date(Number(row.last_updated_at)).toISOString()
        : null
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Paper ledger query failed' };
  }
}

async function engineHealthPayload(env) {
  const now = Date.now();
  const [control, health, apiGuard, autoRow, paper] = await Promise.all([
    getEngineControl(env),
    getEngineHealthRow(env),
    getSharedApiGuardStatus(env).catch(error => ({ ok: false, error: error?.message || 'API guard status failed' })),
    autoStatusRow(env),
    paperHealth(env)
  ]);

  let counts = {};
  let warnings = [];
  try { counts = autoRow?.counts_json ? JSON.parse(autoRow.counts_json) : {}; } catch {}
  try { warnings = autoRow?.warnings_json ? JSON.parse(autoRow.warnings_json) : []; } catch {}

  const state = healthState(control, health, now);
  const plan = watchdogPlan(control, health, now);
  const nextWatchdogMs = health.lastWatchdogMs
    ? health.lastWatchdogMs + WATCHDOG_INTERVAL_MS
    : now;

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    state,
    control,
    worker: { ok: true, status: 'ONLINE' },
    liveScan: {
      status: state,
      lastAttemptAt: health.lastAttemptAt,
      lastSuccessfulScanAt: autoRow?.ran_at
        ? new Date(Number(autoRow.ran_at)).toISOString()
        : health.lastSuccessAt,
      lastErrorAt: health.lastErrorAt,
      lastError: health.lastError || autoRow?.error || null,
      lastErrorCode: health.lastErrorCode,
      consecutiveFailures: health.consecutiveFailures,
      usingLastGoodData: Boolean((health.lastError || autoRow?.error) && autoRow?.payload_json),
      counts,
      warnings
    },
    api: {
      ok: !apiGuard?.error,
      ...apiGuard
    },
    d1: {
      ok: Boolean(paper.ok),
      paper
    },
    watchdog: {
      intervalMinutes: WATCHDOG_INTERVAL_MS / 60_000,
      lastCheckAt: health.lastWatchdogAt,
      nextCheckAt: new Date(Math.max(now, nextWatchdogMs)).toISOString(),
      action: plan.action,
      reason: plan.reason,
      lastRecoveryAt: health.lastRecoveryAt,
      lastRecoveryResult: health.lastRecoveryResult
    }
  };
}

function pausedPayload(control) {
  return {
    ok: true,
    enginePaused: true,
    engineMode: control.mode,
    generatedAt: new Date().toISOString(),
    mode: `ENGINE-${control.mode}`,
    serverOnline: true,
    refreshSeconds: 60,
    counts: {
      allLive: 0,
      minuteWindow: 0,
      completeStats: 0,
      completeMarkets: 0,
      baseCandidates: 0,
      triggered: 0
    },
    candidates: [],
    warnings: [`ENGINE ${control.mode} BY OWNER`]
  };
}

async function runOneShotWake(env, ctx, reason) {
  const control = await getEngineControl(env);
  if (control.mode !== 'RUNNING') return { skipped: true, mode: control.mode };
  const started = Date.now();
  await recordEngineAttempt(env, started);
  try {
    const result = await runAutoMomentumScan(car3Scanner, env, ctx);
    await recordEngineSuccess(env, Date.now());
    await recordRecovery(env, `${reason}: RECOVERED`, Date.now());
    return { skipped: false, ok: true, result };
  } catch (error) {
    const classified = await recordEngineFailure(env, error, Date.now());
    await recordRecovery(env, `${reason}: FAILED · ${classified.code}`, Date.now());
    console.warn(JSON.stringify({ event: 'car3_one_shot_failed', reason, code: classified.code, error: classified.message }));
    return { skipped: false, ok: false, error: classified.message };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && ['/engine-health', '/engine-control'].includes(url.pathname)) {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/engine-health') {
      if (request.method !== 'GET') return json(request, { ok: false, error: 'Method not allowed' }, 405);
      try {
        return json(request, await engineHealthPayload(env), 200);
      } catch (error) {
        return json(request, { ok: false, error: error?.message || 'Engine health failed' }, 500);
      }
    }

    if (url.pathname === '/engine-control') {
      try {
        if (request.method === 'GET') {
          return json(request, { ok: true, ...(await getEngineControl(env)) }, 200);
        }
        if (request.method !== 'POST') return json(request, { ok: false, error: 'Method not allowed' }, 405);
        const body = await request.json().catch(() => null);
        const control = await setEngineMode(env, body?.mode, 'OWNER');
        if (control.mode === 'RUNNING') {
          ctx.waitUntil(runOneShotWake(env, ctx, 'OWNER START'));
        }
        return json(request, {
          ok: true,
          ...control,
          message: control.mode === 'RUNNING'
            ? 'Engine start requested; health check and fresh scan are running'
            : `Engine changed to ${control.mode}; watchdog will not restart it`
        }, 200);
      } catch (error) {
        return json(request, { ok: false, error: error?.message || 'Engine control failed' }, 400);
      }
    }

    const control = await getEngineControl(env).catch(() => ({ mode: 'RUNNING' }));

    if (url.pathname === '/live-condition-scan' && request.method === 'GET' && control.mode !== 'RUNNING') {
      return json(request, pausedPayload(control), 200);
    }

    if (url.pathname === '/car3/auto-scan-status') {
      if (request.method !== 'GET') {
        return json(request, { ok: false, error: 'Method not allowed' }, 405);
      }
      try {
        const internalUrl = new URL(request.url);
        internalUrl.pathname = '/auto-scan-status';
        const [result, apiGuard] = await Promise.all([
          handleAutoRequest(request, env, internalUrl),
          getSharedApiGuardStatus(env)
        ]);
        return json(request, { ...result.data, apiGuard, engine: control }, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Car 3 status failed',
          engine: control
        }, 500);
      }
    }

    if (url.pathname === '/car3/live-condition-scan') {
      if (request.method !== 'GET') {
        return json(request, { ok: false, error: 'Method not allowed' }, 405);
      }
      if (control.mode !== 'RUNNING') return json(request, pausedPayload(control), 200);
      const internalRequest = new Request(
        'https://internal.nomadtips3/live-condition-scan?source=car3',
        { method: 'GET' }
      );
      return car3Scanner.fetch(internalRequest, env, ctx);
    }

    if (url.pathname === '/condition-config' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => null);
      const response = await paperEntry.fetch(request, env, ctx);
      if (response.ok && String(body?.action || '').toLowerCase() === 'run' && control.mode === 'RUNNING') {
        ctx.waitUntil(runOneShotWake(env, ctx, 'POST CONFIG WAKE'));
      }
      return response;
    }

    return paperEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const now = Date.now();
      const control = await getEngineControl(env);
      const before = await getEngineHealthRow(env);
      let recoveryPlanned = false;

      if (watchdogDue(before, now)) {
        const plan = watchdogPlan(control, before, now);
        await recordWatchdogCheck(env, now);
        if (plan.action === 'RECOVER_ON_NEXT_CYCLE') {
          recoveryPlanned = true;
          await recordRecovery(env, `WATCHDOG: ${plan.reason} · normal cron cycle restarted`, now);
        }
      }

      if (control.mode !== 'RUNNING') return;

      await recordEngineAttempt(env, now);

      try {
        const result = await runManagedCycle(env, ctx);
        if (result?.scanOk === false) {
          const classified = await recordEngineFailure(env, result.scanError || 'Automatic scan failed', Date.now());
          if (recoveryPlanned) await recordRecovery(env, `WATCHDOG RECOVERY FAILED · ${classified.code}`, Date.now());
          return;
        }
        if (result?.fullScanAttempted) {
          await recordEngineSuccess(env, Date.now());
          if (recoveryPlanned) await recordRecovery(env, 'WATCHDOG RECOVERED · scheduler healthy', Date.now());
        }
      } catch (error) {
        const classified = await recordEngineFailure(env, error, Date.now());
        if (recoveryPlanned) await recordRecovery(env, `WATCHDOG RECOVERY FAILED · ${classified.code}`, Date.now());
        console.warn(JSON.stringify({
          event: 'car3_scheduled_degraded',
          code: classified.code,
          error: classified.message
        }));
      }
    })());
  }
};

import paperEntry from './paper-entry.js';
import car3Scanner from './entry-batched.js';
import { handleAutoRequest, runAutoMomentumScan } from './auto-scan.js';
import {
  getSharedApiGuardStatus,
  repairSharedApiGuard
} from './shared-api-football.js';
import { runManagedCycle } from './managed-cycle.js';
import {
  WATCHDOG_INTERVAL_MS,
  WATCHDOG_VERSION,
  getEngineControl,
  getEngineHealthRow,
  getWatchdogEvents,
  healthState,
  incrementRepairAttempt,
  recordEngineAttempt,
  recordEngineFailure,
  recordEngineSuccess,
  recordRecovery,
  recordWatchdogCheck,
  recordWatchdogEvent,
  setEngineMode,
  setWatchdogAction,
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

function scanAdvanced(before, after) {
  return Number(after?.ran_at || 0) > Number(before?.ran_at || 0);
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
  const [control, health, apiGuard, autoRow, paper, blackBox] = await Promise.all([
    getEngineControl(env),
    getEngineHealthRow(env),
    getSharedApiGuardStatus(env).catch(error => ({ ok: false, error: error?.message || 'API guard status failed' })),
    autoStatusRow(env),
    paperHealth(env),
    getWatchdogEvents(env, 20).catch(() => [])
  ]);

  let counts = {};
  let warnings = [];
  try { counts = autoRow?.counts_json ? JSON.parse(autoRow.counts_json) : {}; } catch {}
  try { warnings = autoRow?.warnings_json ? JSON.parse(autoRow.warnings_json) : []; } catch {}

  const plan = watchdogPlan(control, health, apiGuard, now);
  const currentAction = plan.action !== 'NONE'
    ? plan.action
    : (health.watchdogAction || 'NONE');
  let state = healthState(control, health, now);
  if (state === 'RUNNING' && ['WAITING_API', 'DERATING', 'RECOVERING', 'VERIFYING', 'REPAIRING'].includes(plan.action)) {
    state = 'DEGRADED';
  }
  const nextWatchdogMs = health.lastWatchdogMs
    ? health.lastWatchdogMs + WATCHDOG_INTERVAL_MS
    : now;

  return {
    ok: true,
    mechanicVersion: WATCHDOG_VERSION,
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
      version: WATCHDOG_VERSION,
      intervalMinutes: WATCHDOG_INTERVAL_MS / 60_000,
      currentAction,
      actionSince: health.watchdogActionSince,
      plannedAction: plan.action,
      reason: plan.reason,
      repairAttempts: health.repairAttempts,
      lastCheckAt: health.lastWatchdogAt,
      nextCheckAt: new Date(Math.max(now, nextWatchdogMs)).toISOString(),
      lastRecoveryAt: health.lastRecoveryAt,
      lastRecoveryResult: health.lastRecoveryResult,
      lastVerifyAt: health.lastVerifyAt
    },
    blackBox
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
  const beforeScan = await autoStatusRow(env);
  const started = Date.now();
  await recordEngineAttempt(env, started);
  await setWatchdogAction(env, 'RECOVERING', `${reason}: fresh scan requested`, started);
  try {
    const result = await runAutoMomentumScan(car3Scanner, env, ctx);
    await setWatchdogAction(env, 'VERIFYING', `${reason}: verifying fresh scan advancement`);
    const afterScan = await autoStatusRow(env);
    if (!scanAdvanced(beforeScan, afterScan)) {
      throw new Error('Fresh scan did not advance during recovery verification');
    }
    await recordEngineSuccess(env, Date.now());
    await recordRecovery(env, `${reason}: RECOVERED`, Date.now());
    await setWatchdogAction(env, 'RECOVERED', `${reason}: fresh scan verified`);
    await recordWatchdogEvent(env, 'RECOVERED', 'RUNNING', null, `${reason}: auto_scan_status advanced`);
    return { skipped: false, ok: true, result };
  } catch (error) {
    const classified = await recordEngineFailure(env, error, Date.now());
    const apiGuard = await getSharedApiGuardStatus(env).catch(() => ({}));
    const health = await getEngineHealthRow(env);
    const plan = watchdogPlan(control, health, apiGuard, Date.now());
    await setWatchdogAction(env, plan.action, `${reason}: ${classified.code} · ${classified.message}`);
    await recordRecovery(env, `${reason}: FAILED · ${classified.code}`, Date.now());
    await recordWatchdogEvent(env, plan.action, 'DEGRADED', classified.code, classified.message);
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
        } else {
          await setWatchdogAction(env, 'NONE', `Owner mode ${control.mode}; automatic restart disabled`);
        }
        return json(request, {
          ok: true,
          ...control,
          message: control.mode === 'RUNNING'
            ? 'Engine start requested; Auto Mechanic is verifying a fresh scan'
            : `Engine changed to ${control.mode}; Auto Mechanic will not restart it`
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
        return json(request, { ...result.data, apiGuard, engine: control, mechanicVersion: WATCHDOG_VERSION }, result.status);
      } catch (error) {
        return json(request, {
          ok: false,
          error: error?.message || 'Car 3 status failed',
          engine: control,
          mechanicVersion: WATCHDOG_VERSION
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
      const beforeHealth = await getEngineHealthRow(env);
      const apiBefore = await getSharedApiGuardStatus(env).catch(() => ({}));
      const beforeScan = await autoStatusRow(env);

      if (watchdogDue(beforeHealth, now)) {
        const plan = watchdogPlan(control, beforeHealth, apiBefore, now);
        await recordWatchdogCheck(env, now);
        await setWatchdogAction(env, plan.action, `15m check: ${plan.reason}`, now);
        await recordWatchdogEvent(env, plan.action, plan.state, beforeHealth.lastErrorCode, plan.reason, now);

        if (plan.action === 'REPAIRING') {
          await incrementRepairAttempt(env, now);
          const repair = await repairSharedApiGuard(env).catch(error => ({ repaired: false, error: error?.message || String(error) }));
          await recordWatchdogEvent(env, 'REPAIR_GUARD', plan.state, beforeHealth.lastErrorCode, JSON.stringify(repair), now);
          if (repair?.repaired) await recordRecovery(env, `AUTO REPAIR · ${(repair.changes || []).join(', ')}`, now);
        }
      }

      if (control.mode !== 'RUNNING') return;

      await recordEngineAttempt(env, now);

      try {
        const result = await runManagedCycle(env, ctx);
        if (result?.scanOk === false) {
          const classified = await recordEngineFailure(env, result.scanError || 'Automatic scan failed', Date.now());
          const apiAfterFailure = await getSharedApiGuardStatus(env).catch(() => ({}));
          const afterFailureHealth = await getEngineHealthRow(env);
          const plan = watchdogPlan(control, afterFailureHealth, apiAfterFailure, Date.now());
          await setWatchdogAction(env, plan.action, `${classified.code}: ${classified.message}`);
          await recordWatchdogEvent(env, plan.action, plan.state, classified.code, classified.message);
          return;
        }

        if (result?.fullScanAttempted) {
          const recovering = Number(beforeHealth.consecutiveFailures || 0) > 0 ||
            ['WAITING_API', 'DERATING', 'RECOVERING', 'VERIFYING', 'REPAIRING'].includes(String(beforeHealth.watchdogAction || ''));

          if (recovering) {
            await setWatchdogAction(env, 'VERIFYING', 'Fresh scan completed; verifying auto_scan_status advancement');
            const afterScan = await autoStatusRow(env);
            if (!scanAdvanced(beforeScan, afterScan)) {
              const classified = await recordEngineFailure(env, 'Fresh scan did not advance during recovery verification', Date.now());
              await setWatchdogAction(env, 'RECOVERING', classified.message);
              await recordWatchdogEvent(env, 'VERIFY_FAILED', 'DEGRADED', classified.code, classified.message);
              return;
            }
            await recordEngineSuccess(env, Date.now());
            await recordRecovery(env, 'WATCHDOG RECOVERED · fresh scan verified', Date.now());
            await setWatchdogAction(env, 'RECOVERED', 'Fresh scan advanced after recovery');
            await recordWatchdogEvent(env, 'RECOVERED', 'RUNNING', null, 'Fresh auto_scan_status timestamp advanced');
          } else {
            await recordEngineSuccess(env, Date.now());
            if (beforeHealth.watchdogAction === 'RECOVERED') {
              await setWatchdogAction(env, 'NONE', 'Healthy follow-up cycle completed');
            }
          }
        }
      } catch (error) {
        const classified = await recordEngineFailure(env, error, Date.now());
        const apiAfterFailure = await getSharedApiGuardStatus(env).catch(() => ({}));
        const afterFailureHealth = await getEngineHealthRow(env);
        const plan = watchdogPlan(control, afterFailureHealth, apiAfterFailure, Date.now());
        await setWatchdogAction(env, plan.action, `${classified.code}: ${classified.message}`);
        await recordWatchdogEvent(env, plan.action, plan.state, classified.code, classified.message);
        console.warn(JSON.stringify({
          event: 'car3_scheduled_degraded',
          code: classified.code,
          action: plan.action,
          error: classified.message
        }));
      }
    })());
  }
};

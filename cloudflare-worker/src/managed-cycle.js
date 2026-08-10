import baseWorker from './entry-batched.js';
import {
  getLatestAutoPayload,
  runAutoMomentumScan
} from './auto-scan.js';
import { runHotConditionScan } from './hot-scan.js';
import {
  settlePendingTrades,
  syncSignalsToPaperTrades
} from './paper-db-side.js';
import { notifyPendingLineEvents } from './line-side.js';
import { getSharedApiGuardStatus } from './shared-api-football.js';
import { getActiveConditionConfig } from './condition-config.js';
import { recordEngineSuccess } from './engine-control.js';

const HOT_BURST_LIMIT_MS = 52_000;
const HOT_BURST_MAX_RUNS = 10;
const THAI_OFFSET_MS = 7 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startOfThaiDay(now) {
  return Math.floor((now + THAI_OFFSET_MS) / DAY_MS) * DAY_MS - THAI_OFFSET_MS;
}

async function dailyTenStatus(env, now = Date.now()) {
  const config = await getActiveConditionConfig(env);
  const enabled = Boolean(config.dailyTenSystem && config.signalLimitEnabled);
  const limit = Math.max(1, Number(config.dailyTenLimit || config.maxSignalsPerDay || 10));
  const dayStart = startOfThaiDay(now);
  let count = 0;

  if (enabled) {
    try {
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM condition_signals WHERE created_at >= ?'
      ).bind(dayStart).first();
      count = Number(row?.total || 0);
    } catch {
      count = 0;
    }
  }

  return {
    enabled,
    limit,
    count,
    remaining: Math.max(0, limit - count),
    sleeping: enabled && count >= limit,
    dayStartAt: new Date(dayStart).toISOString(),
    nextResetAt: new Date(dayStart + DAY_MS).toISOString(),
    timezone: 'Asia/Bangkok'
  };
}

function dailySleepResult(status, startedAt, fullScanAttempted = false) {
  return {
    fullScanAttempted,
    scanOk: true,
    scanError: null,
    hotError: null,
    refreshSeconds: 60,
    hotRuns: 0,
    guardAction: 'DAILY_SLEEP',
    derateLevel: 0,
    dailySleep: true,
    dailyTen: status,
    footballApiPaused: true,
    completedAt: new Date(startedAt).toISOString()
  };
}

function adaptiveRefreshSeconds(payload) {
  const direct = Number(payload?.refreshSeconds);
  if (Number.isFinite(direct)) {
    if (direct <= 15) return 15;
    if (direct <= 30) return 30;
    if (direct <= 60) return 60;
    return 240;
  }
  const counts = payload?.counts || {};
  if (Number(counts.completeMarkets || 0) > 0) return 15;
  if (Number(counts.completeStats || 0) > 0) return 15;
  if (Number(counts.minuteWindow || 0) > 0) return 30;
  if (Number(counts.allLive || 0) > 0) return 60;
  return 240;
}

function generatedAtMs(payload) {
  const value = Date.parse(payload?.generatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function fullScanIsDue(latest, now) {
  if (!latest) return true;
  const last = generatedAtMs(latest);
  if (!last) return true;
  const refresh = adaptiveRefreshSeconds(latest);
  const fullRefresh = Math.max(60, refresh);
  return now - last >= Math.max(55_000, fullRefresh * 1000 - 5_000);
}

function applyGuardCadence(refreshSeconds, guard) {
  if (guard?.circuitOpen || guard?.cooldownActive) return 60;
  const level = Number(guard?.derateLevel || 0);
  if (level >= 2) return Math.max(60, refreshSeconds);
  if (level === 1) return Math.max(30, refreshSeconds);
  return refreshSeconds;
}

async function flushSignalSideEffects(env) {
  try {
    await syncSignalsToPaperTrades(env);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'signal_sync_degraded', error: error?.message || String(error) }));
  }
  try {
    await notifyPendingLineEvents(env);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'line_notify_degraded', error: error?.message || String(error) }));
  }
}

async function settleSignalSideEffects(env) {
  try {
    await syncSignalsToPaperTrades(env);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'paper_signal_sync_degraded', error: error?.message || String(error) }));
  }
  try {
    await settlePendingTrades(env);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'paper_settlement_degraded', error: error?.message || String(error) }));
  }
  try {
    await notifyPendingLineEvents(env);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'line_delivery_degraded', error: error?.message || String(error) }));
  }
}

export async function runManagedCycle(env, ctx) {
  const startedAt = Date.now();
  const capBefore = await dailyTenStatus(env, startedAt);
  if (capBefore.sleeping) {
    await recordEngineSuccess(env, startedAt).catch(() => null);
    await settleSignalSideEffects(env);
    return dailySleepResult(capBefore, startedAt, false);
  }

  let latest = await getLatestAutoPayload(env, 10 * 60_000).catch(() => null);
  let fullScanAttempted = false;
  let scanOk = true;
  let scanError = null;
  let hotError = null;

  if (fullScanIsDue(latest, startedAt)) {
    fullScanAttempted = true;
    try {
      const result = await runAutoMomentumScan(baseWorker, env, ctx);
      if (Number(result?.counts?.newSignals || 0) > 0) await flushSignalSideEffects(env);
    } catch (error) {
      scanOk = false;
      scanError = error?.message || 'Automatic scan failed';
      console.warn(JSON.stringify({ event: 'auto_scan_degraded', error: scanError }));
    }
    latest = await getLatestAutoPayload(env, 10 * 60_000).catch(() => latest);

    const capAfterScan = await dailyTenStatus(env);
    if (capAfterScan.sleeping) {
      await settleSignalSideEffects(env);
      return dailySleepResult(capAfterScan, Date.now(), true);
    }
  }

  let refreshSeconds = adaptiveRefreshSeconds(latest);
  let guard = await getSharedApiGuardStatus(env).catch(() => null);
  refreshSeconds = applyGuardCadence(refreshSeconds, guard);
  let hotRuns = 0;

  while (refreshSeconds < 60 && hotRuns < HOT_BURST_MAX_RUNS) {
    const waitMs = refreshSeconds * 1000;
    if (Date.now() - startedAt + waitMs > HOT_BURST_LIMIT_MS) break;
    await sleep(waitMs);

    guard = await getSharedApiGuardStatus(env).catch(() => guard);
    refreshSeconds = applyGuardCadence(refreshSeconds, guard);
    if (refreshSeconds >= 60) break;

    try {
      const result = await runHotConditionScan(baseWorker, env, ctx);
      hotRuns += 1;
      if (Number(result?.newSignals || 0) > 0) await flushSignalSideEffects(env);
      refreshSeconds = applyGuardCadence(adaptiveRefreshSeconds(result), await getSharedApiGuardStatus(env).catch(() => guard));
    } catch (error) {
      hotError = error?.message || 'Hot condition scan failed';
      console.warn(JSON.stringify({ event: 'hot_scan_degraded', error: hotError }));
      break;
    }
  }

  const capAfterHot = await dailyTenStatus(env);
  if (capAfterHot.sleeping) {
    await settleSignalSideEffects(env);
    return dailySleepResult(capAfterHot, Date.now(), fullScanAttempted);
  }

  await settleSignalSideEffects(env);

  return {
    fullScanAttempted,
    scanOk,
    scanError,
    hotError,
    refreshSeconds,
    hotRuns,
    guardAction: guard?.action || 'UNKNOWN',
    derateLevel: Number(guard?.derateLevel || 0),
    dailySleep: false,
    dailyTen: capAfterHot,
    footballApiPaused: false,
    completedAt: new Date().toISOString()
  };
}

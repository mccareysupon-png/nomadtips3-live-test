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
import { getSharedApiGuardStatus } from './shared-api-football.js';
import { getActiveConditionConfig } from './condition-config.js';
import { recordEngineSuccess } from './engine-control.js';

const HOT_BURST_LIMIT_MS = 52_000;
const HOT_BURST_MAX_RUNS = 10;
const THAI_OFFSET_MS = 7 * 60 * 60_000;
const DAILY_RESET_HOUR = 12;
const DAILY_RESET_MS = DAILY_RESET_HOUR * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startOfThaiCycle(now) {
  return Math.floor((now + THAI_OFFSET_MS - DAILY_RESET_MS) / DAY_MS) * DAY_MS
    - THAI_OFFSET_MS
    + DAILY_RESET_MS;
}

async function dailyTenStatus(env, now = Date.now()) {
  const config = await getActiveConditionConfig(env);
  const enabled = Boolean(config.dailyTenSystem && config.signalLimitEnabled);
  const limit = Math.max(1, Number(config.dailyTenLimit || config.maxSignalsPerDay || 10));
  const cycleStart = startOfThaiCycle(now);
  let count = 0;

  if (enabled) {
    try {
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM condition_signals WHERE created_at >= ?'
      ).bind(cycleStart).first();
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
    resetHour: DAILY_RESET_HOUR,
    cycleStartAt: new Date(cycleStart).toISOString(),
    dayStartAt: new Date(cycleStart).toISOString(),
    nextResetAt: new Date(cycleStart + DAY_MS).toISOString(),
    timezone: 'Asia/Bangkok'
  };
}

async function pendingSettlementStatus(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT
        COUNT(*) AS pending,
        MIN(created_at) AS oldest_created_at,
        MAX(updated_at) AS last_updated_at
      FROM paper_trades_side
      WHERE status = 'PENDING'
    `).first();
    const pending = Number(row?.pending || 0);
    return {
      pending,
      oldestPendingAt: Number(row?.oldest_created_at || 0)
        ? new Date(Number(row.oldest_created_at)).toISOString()
        : null,
      lastUpdatedAt: Number(row?.last_updated_at || 0)
        ? new Date(Number(row.last_updated_at)).toISOString()
        : null
    };
  } catch (error) {
    return {
      pending: 0,
      oldestPendingAt: null,
      lastUpdatedAt: null,
      error: error?.message || 'Pending settlement query failed'
    };
  }
}

function dailyCapResult(status, settlement, startedAt, fullScanAttempted = false) {
  const pendingResults = Number(settlement?.pending || 0);
  const settlementDrain = pendingResults > 0 || Boolean(settlement?.error);
  return {
    fullScanAttempted,
    scanOk: true,
    scanError: null,
    hotError: null,
    refreshSeconds: 60,
    hotRuns: 0,
    guardAction: settlementDrain ? 'SETTLING_PENDING_RESULTS' : 'DAILY_SLEEP',
    derateLevel: 0,
    dailySleep: !settlementDrain,
    signalCapturePaused: true,
    settlementDrain,
    pendingResults,
    settlement,
    dailyTen: {
      ...status,
      capReached: true,
      waitingForResults: settlementDrain
    },
    footballApiPaused: !settlementDrain,
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
  // LINE signal/result delivery moved to CAR 3.1. Engine 3 keeps only its paper/state side effects.
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
  // LINE result delivery moved to CAR 3.1. Settlement itself remains unchanged here.
  return pendingSettlementStatus(env);
}

async function drainBeforeSleep(env) {
  const settlement = await settleSignalSideEffects(env);
  return settlement;
}

export async function runManagedCycle(env, ctx) {
  const startedAt = Date.now();
  const capBefore = await dailyTenStatus(env, startedAt);
  if (capBefore.sleeping) {
    await recordEngineSuccess(env, startedAt).catch(() => null);
    const settlement = await drainBeforeSleep(env);
    return dailyCapResult(capBefore, settlement, startedAt, false);
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
      const settlement = await drainBeforeSleep(env);
      return dailyCapResult(capAfterScan, settlement, Date.now(), true);
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
    const settlement = await drainBeforeSleep(env);
    return dailyCapResult(capAfterHot, settlement, Date.now(), fullScanAttempted);
  }

  const settlement = await settleSignalSideEffects(env);

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
    signalCapturePaused: false,
    settlementDrain: Number(settlement?.pending || 0) > 0,
    pendingResults: Number(settlement?.pending || 0),
    settlement,
    dailyTen: capAfterHot,
    footballApiPaused: false,
    completedAt: new Date().toISOString()
  };
}
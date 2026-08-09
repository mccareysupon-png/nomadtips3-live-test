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

const HOT_BURST_LIMIT_MS = 52_000;
const HOT_BURST_MAX_RUNS = 10;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

export async function runManagedCycle(env, ctx) {
  const startedAt = Date.now();
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
      // Recoverable scan failures are health events, not unhandled Worker errors.
      console.warn(JSON.stringify({ event: 'auto_scan_degraded', error: scanError }));
    }
    latest = await getLatestAutoPayload(env, 10 * 60_000).catch(() => latest);
  }

  let refreshSeconds = adaptiveRefreshSeconds(latest);
  let hotRuns = 0;

  while (refreshSeconds < 60 && hotRuns < HOT_BURST_MAX_RUNS) {
    const waitMs = refreshSeconds * 1000;
    if (Date.now() - startedAt + waitMs > HOT_BURST_LIMIT_MS) break;
    await sleep(waitMs);

    try {
      const result = await runHotConditionScan(baseWorker, env, ctx);
      hotRuns += 1;
      if (Number(result?.newSignals || 0) > 0) await flushSignalSideEffects(env);
      refreshSeconds = adaptiveRefreshSeconds(result);
    } catch (error) {
      hotError = error?.message || 'Hot condition scan failed';
      console.warn(JSON.stringify({ event: 'hot_scan_degraded', error: hotError }));
      break;
    }
  }

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

  return {
    fullScanAttempted,
    scanOk,
    scanError,
    hotError,
    refreshSeconds,
    hotRuns,
    completedAt: new Date().toISOString()
  };
}

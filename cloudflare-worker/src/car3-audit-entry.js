import car3Entry from './car3-entry.js';
import baseWorker from './entry-batched.js';
import { runAutoMomentumScan } from './auto-scan.js';
import { getActiveConditionConfig } from './condition-config.js';
import { getSharedApiGuardStatus } from './shared-api-football.js';
import {
  getEngineHealthRow,
  recordWatchdogEvent,
  setWatchdogAction
} from './engine-control.js';

const AUDIT_STALE_MS = 2 * 60_000;
const ACTIVE_STATE_MS = 15 * 60_000;
const MAX_AUTO_REPAIR_ATTEMPTS = 2;

const AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS condition_audit_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  config_version INTEGER NOT NULL DEFAULT 0,
  scanned_states INTEGER NOT NULL DEFAULT 0,
  expected_triggers INTEGER NOT NULL DEFAULT 0,
  daily_signals INTEGER NOT NULL DEFAULT 0,
  signal_limit_reached INTEGER NOT NULL DEFAULT 0,
  mismatches_json TEXT NOT NULL DEFAULT '[]',
  repair_state TEXT NOT NULL DEFAULT 'NONE',
  repair_attempts INTEGER NOT NULL DEFAULT 0,
  last_repair_at INTEGER,
  last_repair_result TEXT,
  mismatch_signature TEXT,
  updated_at INTEGER NOT NULL
)`;

let auditSchemaReady = false;

function startOfThaiDay(now) {
  const offset = 7 * 60 * 60_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

function iso(value) {
  const number = Number(value || 0);
  return number > 0 ? new Date(number).toISOString() : null;
}

async function addColumn(env, sql) {
  try { await env.DB.prepare(sql).run(); } catch (error) {
    if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
  }
}

async function ensureAuditSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (auditSchemaReady) return;
  await env.DB.prepare(AUDIT_TABLE_SQL).run();
  await addColumn(env, `ALTER TABLE condition_audit_status ADD COLUMN repair_state TEXT NOT NULL DEFAULT 'NONE'`);
  await addColumn(env, `ALTER TABLE condition_audit_status ADD COLUMN repair_attempts INTEGER NOT NULL DEFAULT 0`);
  await addColumn(env, `ALTER TABLE condition_audit_status ADD COLUMN last_repair_at INTEGER`);
  await addColumn(env, `ALTER TABLE condition_audit_status ADD COLUMN last_repair_result TEXT`);
  await addColumn(env, `ALTER TABLE condition_audit_status ADD COLUMN mismatch_signature TEXT`);
  auditSchemaReady = true;
}

function parseMismatches(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedRepairState(row) {
  if (Number(row?.ok)) return 'NONE';
  const state = String(row?.repair_state || '').toUpperCase();
  return state && state !== 'NONE' ? state : 'REPAIR_PENDING';
}

function rowToAudit(row) {
  if (!row) return null;
  const mismatches = parseMismatches(row.mismatches_json);
  const repairState = normalizedRepairState(row);
  return {
    ok: Boolean(Number(row.ok)),
    status: Number(row.ok) ? 'OK' : repairState,
    checkedAt: iso(row.checked_at),
    checkedAtMs: Number(row.checked_at || 0),
    configVersion: Number(row.config_version || 0),
    scannedStates: Number(row.scanned_states || 0),
    expectedTriggers: Number(row.expected_triggers || 0),
    dailySignals: Number(row.daily_signals || 0),
    signalLimitReached: Boolean(Number(row.signal_limit_reached)),
    mismatchCount: mismatches.length,
    mismatches,
    mismatchSignature: String(row.mismatch_signature || ''),
    repairState,
    repairAttempts: Number(row.repair_attempts || 0),
    lastRepairAt: iso(row.last_repair_at),
    lastRepairResult: row.last_repair_result || null,
    autoRepairEnabled: true,
    maxAutoRepairAttempts: MAX_AUTO_REPAIR_ATTEMPTS,
    mode: 'LOCAL_AUDIT_PLUS_SAFE_RESCAN_ON_MISMATCH'
  };
}

async function getAuditStatus(env) {
  await ensureAuditSchema(env);
  const row = await env.DB.prepare('SELECT * FROM condition_audit_status WHERE id = 1').first();
  return rowToAudit(row);
}

async function signalKeysForStates(env, states) {
  const keys = [...new Set(states.map(row => String(row.state_key || '')).filter(Boolean))];
  const found = new Set();
  for (let index = 0; index < keys.length; index += 50) {
    const group = keys.slice(index, index + 50);
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT signal_key FROM condition_signals WHERE signal_key IN (${placeholders})
    `).bind(...group).all();
    for (const row of result.results || []) found.add(String(row.signal_key));
  }
  return found;
}

function mismatchSignature(items) {
  return JSON.stringify((items || []).map(item => [
    item.code,
    String(item.stateKey || ''),
    Number(item.fixtureId || 0),
    String(item.selectedSide || '')
  ]));
}

async function evaluateConditionAudit(env, config, now = Date.now()) {
  const stateResult = await env.DB.prepare(`
    SELECT state_key, fixture_id, selected_side, home, away, last_minute,
           last_home_percent, streak, triggered, config_version, updated_at
    FROM auto_momentum_state_side
    WHERE updated_at >= ? AND config_version = ?
    ORDER BY fixture_id, selected_side
    LIMIT 500
  `).bind(now - ACTIVE_STATE_MS, Number(config.version || 0)).all();
  const states = stateResult.results || [];
  const [signalKeys, dailyCountRow] = await Promise.all([
    signalKeysForStates(env, states),
    env.DB.prepare('SELECT COUNT(*) AS total FROM condition_signals WHERE created_at >= ?')
      .bind(startOfThaiDay(now)).first()
  ]);

  const dailySignals = Number(dailyCountRow?.total || 0);
  const signalLimitReached = Boolean(
    config.signalLimitEnabled && dailySignals >= Number(config.maxSignalsPerDay || 0)
  );
  const mismatches = [];
  let expectedTriggers = 0;

  for (const row of states) {
    const key = String(row.state_key || '');
    const momentum = Number(row.last_home_percent);
    const streak = Number(row.streak || 0);
    const stateTriggered = Boolean(Number(row.triggered));
    const signalExists = signalKeys.has(key);
    const passConfirmed = Number.isFinite(momentum) &&
      momentum >= Number(config.momentumMin || 0) &&
      streak >= Number(config.confirmationRounds || 1);

    if (passConfirmed) expectedTriggers += 1;

    const base = {
      stateKey: key,
      fixtureId: Number(row.fixture_id),
      selectedSide: String(row.selected_side || 'HOME'),
      selectedTeam: String(row.home || ''),
      opponent: String(row.away || ''),
      minute: Number(row.last_minute || 0),
      momentum,
      streak
    };

    if (passConfirmed && !stateTriggered && !signalLimitReached) {
      mismatches.push({ ...base, code: 'MISSED_TRIGGER_STATE', detail: 'Pass + confirmation reached but trigger flag is still off' });
    }
    if (stateTriggered && !signalExists) {
      mismatches.push({ ...base, code: 'TRIGGERED_WITHOUT_SIGNAL', detail: 'Trigger flag is on but condition_signals row is missing' });
    }
    if (signalExists && !stateTriggered) {
      mismatches.push({ ...base, code: 'SIGNAL_WITHOUT_STATE', detail: 'Signal exists but active trigger state is off' });
    }
  }

  return {
    ok: mismatches.length === 0,
    checkedAtMs: now,
    configVersion: Number(config.version || 0),
    scannedStates: states.length,
    expectedTriggers,
    dailySignals,
    signalLimitReached,
    mismatches: mismatches.slice(0, 20),
    mismatchSignature: mismatchSignature(mismatches)
  };
}

async function saveAudit(env, snapshot, repairState, repairAttempts, lastRepairResult = null, lastRepairAt = null) {
  const now = Number(snapshot.checkedAtMs || Date.now());
  const ok = snapshot.ok && repairState === 'NONE';
  await env.DB.prepare(`
    INSERT INTO condition_audit_status (
      id, checked_at, ok, config_version, scanned_states, expected_triggers,
      daily_signals, signal_limit_reached, mismatches_json,
      repair_state, repair_attempts, last_repair_at, last_repair_result,
      mismatch_signature, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      checked_at = excluded.checked_at,
      ok = excluded.ok,
      config_version = excluded.config_version,
      scanned_states = excluded.scanned_states,
      expected_triggers = excluded.expected_triggers,
      daily_signals = excluded.daily_signals,
      signal_limit_reached = excluded.signal_limit_reached,
      mismatches_json = excluded.mismatches_json,
      repair_state = excluded.repair_state,
      repair_attempts = excluded.repair_attempts,
      last_repair_at = excluded.last_repair_at,
      last_repair_result = excluded.last_repair_result,
      mismatch_signature = excluded.mismatch_signature,
      updated_at = excluded.updated_at
  `).bind(
    now,
    ok ? 1 : 0,
    Number(snapshot.configVersion || 0),
    Number(snapshot.scannedStates || 0),
    Number(snapshot.expectedTriggers || 0),
    Number(snapshot.dailySignals || 0),
    snapshot.signalLimitReached ? 1 : 0,
    JSON.stringify(snapshot.mismatches || []),
    String(repairState || 'NONE'),
    Number(repairAttempts || 0),
    lastRepairAt ? Number(lastRepairAt) : null,
    lastRepairResult ? String(lastRepairResult) : null,
    String(snapshot.mismatchSignature || ''),
    Date.now()
  ).run();
  return getAuditStatus(env);
}

async function reconcileLocalState(env, mismatches) {
  const statements = [];
  const changes = [];
  for (const item of mismatches || []) {
    const key = String(item.stateKey || '');
    if (!key) continue;
    if (item.code === 'SIGNAL_WITHOUT_STATE') {
      statements.push(env.DB.prepare(`
        UPDATE auto_momentum_state_side
        SET triggered = 1
        WHERE state_key = ? AND triggered = 0
          AND EXISTS (SELECT 1 FROM condition_signals WHERE signal_key = ?)
      `).bind(key, key));
      changes.push(`STATE_TRIGGER_ON:${key}`);
    } else if (item.code === 'TRIGGERED_WITHOUT_SIGNAL') {
      statements.push(env.DB.prepare(`
        UPDATE auto_momentum_state_side
        SET triggered = 0
        WHERE state_key = ? AND triggered = 1
          AND NOT EXISTS (SELECT 1 FROM condition_signals WHERE signal_key = ?)
      `).bind(key, key));
      changes.push(`STALE_TRIGGER_OFF:${key}`);
    }
  }
  if (statements.length) await env.DB.batch(statements);
  return changes;
}

function requiresFreshScan(mismatches) {
  return (mismatches || []).some(item =>
    ['MISSED_TRIGGER_STATE', 'TRIGGERED_WITHOUT_SIGNAL'].includes(String(item.code || ''))
  );
}

function providerProtectionActive(guard) {
  return Boolean(guard?.cooldownActive || guard?.circuitOpen);
}

async function clearAuditEscalationIfSafe(env, previous) {
  if (previous?.status !== 'NEEDS_ADD_K') return;
  const health = await getEngineHealthRow(env).catch(() => null);
  if (!health || Number(health.consecutiveFailures || 0) > 0 || health.lastErrorCode) return;
  await setWatchdogAction(env, 'NONE', 'Condition Audit recovered; no engine failure remains').catch(() => null);
}

async function markRecovered(env, previous, result) {
  if (previous && !previous.ok) {
    await recordWatchdogEvent(
      env,
      'CONDITION_AUDIT_RECOVERED',
      'RUNNING',
      null,
      result || 'Condition trigger/state/signal consistency recovered'
    );
    await clearAuditEscalationIfSafe(env, previous);
  }
}

async function markNeedsAddK(env, audit, previous, detail, now = Date.now()) {
  const sameEscalation = previous?.status === 'NEEDS_ADD_K' &&
    previous?.mismatchSignature === audit?.mismatchSignature;
  if (!sameEscalation) {
    await setWatchdogAction(env, 'NEEDS_ADD_K', detail, now);
    await recordWatchdogEvent(env, 'CONDITION_AUDIT_NEEDS_ADD_K', 'NEEDS_ADD_K', 'CONDITION_AUDIT', detail, now);
  }
}

async function runConditionAudit(env, ctx, { allowRepair = true } = {}) {
  await ensureAuditSchema(env);
  const config = await getActiveConditionConfig(env);
  const previous = await getAuditStatus(env).catch(() => null);
  let snapshot = await evaluateConditionAudit(env, config);

  if (snapshot.ok) {
    const result = previous && !previous.ok ? 'RECOVERED · audit clean' : previous?.lastRepairResult;
    const saved = await saveAudit(env, snapshot, 'NONE', 0, result, previous?.lastRepairAt ? Date.parse(previous.lastRepairAt) : null);
    await markRecovered(env, previous, 'Condition trigger/state/signal consistency recovered');
    return saved;
  }

  const sameSignature = previous?.mismatchSignature === snapshot.mismatchSignature;
  let attempts = sameSignature ? Number(previous?.repairAttempts || 0) : 0;
  const guardBefore = await getSharedApiGuardStatus(env).catch(() => null);

  if (!allowRepair) {
    const state = providerProtectionActive(guardBefore)
      ? 'WAITING_API'
      : (sameSignature && previous?.status === 'NEEDS_ADD_K' ? 'NEEDS_ADD_K' : 'REPAIR_PENDING');
    return saveAudit(
      env,
      snapshot,
      state,
      attempts,
      previous?.lastRepairResult || 'Waiting for scheduled Auto Mechanic repair cycle',
      previous?.lastRepairAt ? Date.parse(previous.lastRepairAt) : null
    );
  }

  if (sameSignature && attempts >= MAX_AUTO_REPAIR_ATTEMPTS) {
    const detail = `Condition Audit auto-repair exhausted after ${attempts} attempt(s): ${snapshot.mismatches.slice(0, 3).map(item => `${item.code} fixture ${item.fixtureId}/${item.selectedSide}`).join(', ')}`;
    const saved = await saveAudit(env, snapshot, 'NEEDS_ADD_K', attempts, detail, Date.now());
    await markNeedsAddK(env, saved, previous, detail);
    return saved;
  }

  await recordWatchdogEvent(
    env,
    'CONDITION_AUDIT_REPAIRING',
    'DEGRADED',
    'CONDITION_AUDIT',
    `Safe repair starting for ${snapshot.mismatches.length} mismatch(es); attempt ${attempts + 1}/${MAX_AUTO_REPAIR_ATTEMPTS}`
  );

  const localChanges = await reconcileLocalState(env, snapshot.mismatches);
  if (localChanges.length) {
    snapshot = await evaluateConditionAudit(env, config);
    if (snapshot.ok) {
      const result = `RECOVERED_LOCAL · ${localChanges.join(', ')}`;
      const saved = await saveAudit(env, snapshot, 'NONE', 0, result, Date.now());
      await markRecovered(env, previous, result);
      return saved;
    }
  }

  if (!requiresFreshScan(snapshot.mismatches)) {
    attempts += 1;
    const detail = `Local reconciliation incomplete: ${snapshot.mismatches.slice(0, 3).map(item => item.code).join(', ')}`;
    const state = attempts >= MAX_AUTO_REPAIR_ATTEMPTS ? 'NEEDS_ADD_K' : 'REPAIRING';
    const saved = await saveAudit(env, snapshot, state, attempts, detail, Date.now());
    if (state === 'NEEDS_ADD_K') await markNeedsAddK(env, saved, previous, detail);
    return saved;
  }

  const guard = await getSharedApiGuardStatus(env).catch(() => guardBefore);
  if (providerProtectionActive(guard)) {
    const detail = `Condition repair waiting for Football API guard: ${guard?.circuitOpen ? 'CIRCUIT_OPEN' : 'COOLDOWN'}`;
    if (previous?.status !== 'WAITING_API' || !sameSignature) {
      await recordWatchdogEvent(env, 'CONDITION_AUDIT_WAITING_API', 'DEGRADED', 'CONDITION_AUDIT', detail);
    }
    return saveAudit(env, snapshot, 'WAITING_API', attempts, detail, previous?.lastRepairAt ? Date.parse(previous.lastRepairAt) : null);
  }

  attempts += 1;
  let scanError = null;
  try {
    await runAutoMomentumScan(baseWorker, env, ctx);
  } catch (error) {
    scanError = error?.message || String(error);
    await recordWatchdogEvent(env, 'CONDITION_AUDIT_RESCAN_FAILED', 'DEGRADED', 'CONDITION_AUDIT', scanError);
  }

  snapshot = await evaluateConditionAudit(env, config);
  if (snapshot.ok) {
    const result = `RECOVERED_RESCAN · attempt ${attempts}${localChanges.length ? ` · ${localChanges.join(', ')}` : ''}`;
    const saved = await saveAudit(env, snapshot, 'NONE', 0, result, Date.now());
    await markRecovered(env, previous, result);
    return saved;
  }

  const guardAfter = await getSharedApiGuardStatus(env).catch(() => null);
  if (scanError && providerProtectionActive(guardAfter)) {
    const detail = `Rescan deferred by provider protection: ${scanError}`;
    return saveAudit(env, snapshot, 'WAITING_API', attempts, detail, Date.now());
  }

  const detail = scanError
    ? `Auto-repair rescan failed: ${scanError}`
    : `Auto-repair rescan still has ${snapshot.mismatches.length} mismatch(es)`;
  const state = attempts >= MAX_AUTO_REPAIR_ATTEMPTS ? 'NEEDS_ADD_K' : 'REPAIRING';
  const saved = await saveAudit(env, snapshot, state, attempts, detail, Date.now());
  if (state === 'NEEDS_ADD_K') await markNeedsAddK(env, saved, previous, detail);
  return saved;
}

async function currentAudit(env, ctx) {
  const audit = await getAuditStatus(env).catch(() => null);
  if (!audit || Date.now() - Number(audit.checkedAtMs || 0) > AUDIT_STALE_MS) {
    return runConditionAudit(env, ctx, { allowRepair: false }).catch(error => ({
      ok: false,
      status: 'AUDIT_ERROR',
      checkedAt: new Date().toISOString(),
      mismatchCount: 0,
      mismatches: [],
      repairAttempts: 0,
      autoRepairEnabled: true,
      maxAutoRepairAttempts: MAX_AUTO_REPAIR_ATTEMPTS,
      error: error?.message || String(error),
      mode: 'LOCAL_AUDIT_PLUS_SAFE_RESCAN_ON_MISMATCH'
    }));
  }
  return audit;
}

function responseWithAudit(response, payload, audit) {
  const data = payload && typeof payload === 'object' ? { ...payload, conditionAudit: audit } : payload;
  if (data?.watchdog && typeof data.watchdog === 'object') {
    data.watchdog = {
      ...data.watchdog,
      conditionAuditStatus: audit?.status || 'UNKNOWN',
      conditionAuditRepairAttempts: Number(audit?.repairAttempts || 0)
    };
  }
  if (data && audit?.status === 'NEEDS_ADD_K') {
    data.state = 'NEEDS_ADD_K';
    if (data.watchdog && typeof data.watchdog === 'object') {
      const reason = `Condition Audit: ${audit.mismatchCount} mismatch(es) after ${audit.repairAttempts} repair attempt(s) · ${audit.mismatches?.[0]?.code || 'CHECK REQUIRED'}`;
      data.watchdog = {
        ...data.watchdog,
        currentAction: 'NEEDS_ADD_K',
        plannedAction: 'NEEDS_ADD_K',
        reason
      };
    }
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data, null, 2), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function makeAuditContext(env, ctx) {
  let firstWait = true;
  return {
    waitUntil(promise) {
      if (firstWait) {
        firstWait = false;
        ctx.waitUntil(Promise.resolve(promise)
          .then(() => runConditionAudit(env, ctx, { allowRepair: true }))
          .catch(async error => {
            await recordWatchdogEvent(
              env,
              'CONDITION_AUDIT_ERROR',
              'DEGRADED',
              'CONDITION_AUDIT',
              error?.message || String(error)
            ).catch(() => null);
          }));
        return;
      }
      ctx.waitUntil(promise);
    },
    passThroughOnException() {
      return ctx.passThroughOnException?.();
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const wrappedCtx = makeAuditContext(env, ctx);
    const response = await car3Entry.fetch(request, env, wrappedCtx);
    if (!['/engine-health', '/car3/auto-scan-status'].includes(url.pathname)) return response;
    const payload = await response.clone().json().catch(() => null);
    if (!payload || typeof payload !== 'object') return response;
    const audit = await currentAudit(env, ctx);
    return responseWithAudit(response, payload, audit);
  },

  async scheduled(controller, env, ctx) {
    return car3Entry.scheduled(controller, env, makeAuditContext(env, ctx));
  }
};

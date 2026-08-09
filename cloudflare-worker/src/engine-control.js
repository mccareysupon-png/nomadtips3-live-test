const ENGINE_CONTROL_SQL = `
CREATE TABLE IF NOT EXISTS engine_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'RUNNING',
  changed_at INTEGER NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'OWNER'
)`;

const ENGINE_HEALTH_SQL = `
CREATE TABLE IF NOT EXISTS engine_health (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error TEXT,
  last_error_code TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_watchdog_at INTEGER,
  last_recovery_at INTEGER,
  last_recovery_result TEXT,
  updated_at INTEGER NOT NULL
)`;

const WATCHDOG_LOG_SQL = `
CREATE TABLE IF NOT EXISTS engine_watchdog_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  state TEXT,
  error_code TEXT,
  detail TEXT
)`;

export const ENGINE_MODES = Object.freeze(['RUNNING', 'MAINTENANCE', 'STOPPED']);
export const WATCHDOG_INTERVAL_MS = 15 * 60_000;
export const STALL_AFTER_MS = 7 * 60_000;
export const NEEDS_ADD_K_FAILURES = 6;
export const WATCHDOG_VERSION = 2;

let schemaReady = false;

function iso(value) {
  const number = Number(value || 0);
  return number > 0 ? new Date(number).toISOString() : null;
}

function cleanMessage(error) {
  const message = String(error?.message || error || 'Unknown engine error').trim();
  return message || 'Unknown engine error';
}

async function addColumn(env, sql) {
  try { await env.DB.prepare(sql).run(); } catch (error) {
    if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
  }
}

export function classifyEngineError(error) {
  const message = cleanMessage(error);
  const text = message.toLowerCase();
  if (/429|too many requests|rate.?limit/.test(text)) return { code: 'API_429', message };
  if (/cooldown|circuit.?breaker/.test(text)) return { code: 'API_COOLDOWN', message };
  if (/abort|timeout|timed out/.test(text)) return { code: 'TIMEOUT', message };
  if (/d1|sqlite|database|db /.test(text)) return { code: 'D1', message };
  if (/verify|fresh scan did not advance/.test(text)) return { code: 'VERIFY_FAILED', message };
  if (/live scan http/.test(text)) return { code: 'BASE_SCAN_HTTP', message };
  if (/api http/.test(text)) return { code: 'API_HTTP', message };
  if (/fetch/.test(text)) return { code: 'FETCH', message };
  if (/automatic scan failed|base scan/.test(text)) return { code: 'BASE_SCAN', message };
  return { code: 'UNKNOWN', message };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(ENGINE_CONTROL_SQL),
    env.DB.prepare(ENGINE_HEALTH_SQL),
    env.DB.prepare(WATCHDOG_LOG_SQL),
    env.DB.prepare(`
      INSERT OR IGNORE INTO engine_control (id, mode, changed_at, changed_by)
      VALUES (1, 'RUNNING', ?, 'SYSTEM')
    `).bind(now),
    env.DB.prepare(`
      INSERT OR IGNORE INTO engine_health (id, consecutive_failures, updated_at)
      VALUES (1, 0, ?)
    `).bind(now)
  ]);
  await addColumn(env, `ALTER TABLE engine_health ADD COLUMN watchdog_action TEXT NOT NULL DEFAULT 'NONE'`);
  await addColumn(env, `ALTER TABLE engine_health ADD COLUMN watchdog_action_since INTEGER`);
  await addColumn(env, `ALTER TABLE engine_health ADD COLUMN repair_attempts INTEGER NOT NULL DEFAULT 0`);
  await addColumn(env, `ALTER TABLE engine_health ADD COLUMN last_verify_at INTEGER`);
  schemaReady = true;
}

export async function getEngineControl(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM engine_control WHERE id = 1').first();
  const mode = ENGINE_MODES.includes(String(row?.mode || '').toUpperCase())
    ? String(row.mode).toUpperCase()
    : 'RUNNING';
  return {
    mode,
    changedAt: iso(row?.changed_at),
    changedBy: row?.changed_by || 'SYSTEM'
  };
}

export async function setEngineMode(env, requestedMode, changedBy = 'OWNER') {
  await ensureSchema(env);
  const mode = String(requestedMode || '').toUpperCase();
  if (!ENGINE_MODES.includes(mode)) throw new Error('Engine mode must be RUNNING, MAINTENANCE or STOPPED');
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE engine_control
    SET mode = ?, changed_at = ?, changed_by = ?
    WHERE id = 1
  `).bind(mode, now, String(changedBy || 'OWNER')).run();
  await recordWatchdogEvent(env, `OWNER_${mode}`, mode, null, `Owner changed engine mode to ${mode}`, now);
  return getEngineControl(env);
}

export async function recordEngineAttempt(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health SET last_attempt_at = ?, updated_at = ? WHERE id = 1
  `).bind(at, at).run();
}

export async function recordEngineSuccess(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_success_at = ?, last_error = NULL, last_error_code = NULL,
        consecutive_failures = 0, repair_attempts = 0, last_verify_at = ?, updated_at = ?
    WHERE id = 1
  `).bind(at, at, at).run();
}

export async function recordEngineFailure(env, error, at = Date.now()) {
  await ensureSchema(env);
  const classified = classifyEngineError(error);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_error_at = ?, last_error = ?, last_error_code = ?,
        consecutive_failures = consecutive_failures + 1, updated_at = ?
    WHERE id = 1
  `).bind(at, classified.message, classified.code, at).run();
  return classified;
}

export async function recordWatchdogCheck(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health SET last_watchdog_at = ?, updated_at = ? WHERE id = 1
  `).bind(at, at).run();
}

export async function setWatchdogAction(env, action, detail = null, at = Date.now()) {
  await ensureSchema(env);
  const normalized = String(action || 'NONE').toUpperCase();
  await env.DB.prepare(`
    UPDATE engine_health
    SET watchdog_action = ?, watchdog_action_since = ?, updated_at = ?
    WHERE id = 1
  `).bind(normalized, at, at).run();
  if (detail) await recordWatchdogEvent(env, normalized, null, null, detail, at);
}

export async function incrementRepairAttempt(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET repair_attempts = repair_attempts + 1, updated_at = ?
    WHERE id = 1
  `).bind(at).run();
}

export async function recordRecovery(env, result, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_recovery_at = ?, last_recovery_result = ?, updated_at = ?
    WHERE id = 1
  `).bind(at, String(result || 'RECOVERY ATTEMPTED'), at).run();
}

export async function recordWatchdogEvent(env, action, state = null, errorCode = null, detail = null, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO engine_watchdog_log (at, action, state, error_code, detail)
    VALUES (?, ?, ?, ?, ?)
  `).bind(at, String(action || 'EVENT'), state, errorCode, detail).run();
  await env.DB.prepare(`
    DELETE FROM engine_watchdog_log
    WHERE id NOT IN (SELECT id FROM engine_watchdog_log ORDER BY id DESC LIMIT 120)
  `).run().catch(() => null);
}

export async function getWatchdogEvents(env, limit = 20) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`
    SELECT id, at, action, state, error_code, detail
    FROM engine_watchdog_log ORDER BY id DESC LIMIT ?
  `).bind(Math.max(1, Math.min(100, Number(limit) || 20))).all();
  return (rows?.results || []).map(row => ({
    id: Number(row.id),
    at: iso(row.at),
    action: row.action,
    state: row.state || null,
    errorCode: row.error_code || null,
    detail: row.detail || null
  }));
}

export async function getEngineHealthRow(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM engine_health WHERE id = 1').first();
  return {
    lastAttemptAt: iso(row?.last_attempt_at),
    lastAttemptMs: Number(row?.last_attempt_at || 0),
    lastSuccessAt: iso(row?.last_success_at),
    lastSuccessMs: Number(row?.last_success_at || 0),
    lastErrorAt: iso(row?.last_error_at),
    lastError: row?.last_error || null,
    lastErrorCode: row?.last_error_code || null,
    consecutiveFailures: Number(row?.consecutive_failures || 0),
    lastWatchdogAt: iso(row?.last_watchdog_at),
    lastWatchdogMs: Number(row?.last_watchdog_at || 0),
    lastRecoveryAt: iso(row?.last_recovery_at),
    lastRecoveryResult: row?.last_recovery_result || null,
    watchdogAction: row?.watchdog_action || 'NONE',
    watchdogActionSince: iso(row?.watchdog_action_since),
    repairAttempts: Number(row?.repair_attempts || 0),
    lastVerifyAt: iso(row?.last_verify_at),
    updatedAt: iso(row?.updated_at)
  };
}

export function healthState(control, health, now = Date.now()) {
  const mode = control?.mode || 'RUNNING';
  if (mode === 'STOPPED') return 'STOPPED';
  if (mode === 'MAINTENANCE') return 'MAINTENANCE';
  const attemptAge = health?.lastAttemptMs ? now - health.lastAttemptMs : Infinity;
  const successAge = health?.lastSuccessMs ? now - health.lastSuccessMs : Infinity;
  const failures = Number(health?.consecutiveFailures || 0);
  if (health?.lastErrorCode === 'UNKNOWN' || failures >= NEEDS_ADD_K_FAILURES) return 'NEEDS_ADD_K';
  if (attemptAge > STALL_AFTER_MS) return 'STALLED';
  if (failures > 0 || successAge > STALL_AFTER_MS) return 'DEGRADED';
  return 'RUNNING';
}

export function watchdogDue(health, now = Date.now()) {
  return !health?.lastWatchdogMs || now - health.lastWatchdogMs >= WATCHDOG_INTERVAL_MS;
}

export function watchdogPlan(control, health, apiGuard = {}, now = Date.now()) {
  const state = healthState(control, health, now);
  const attemptAge = health?.lastAttemptMs ? now - health.lastAttemptMs : Infinity;
  const failures = Number(health?.consecutiveFailures || 0);
  const errorCode = String(health?.lastErrorCode || '');

  if (control?.mode !== 'RUNNING') {
    return { state, action: 'NONE', reason: `Owner mode ${control?.mode || 'UNKNOWN'}` };
  }
  if (state === 'NEEDS_ADD_K') {
    return { state, action: 'NEEDS_ADD_K', reason: errorCode === 'UNKNOWN' ? 'Unknown failure; automatic guessing is disabled' : 'Repeated failures require Add K inspection' };
  }
  if (apiGuard?.circuitOpen || apiGuard?.cooldownActive || ['API_429', 'API_COOLDOWN'].includes(errorCode)) {
    return { state: 'DEGRADED', action: 'WAITING_API', reason: 'Provider protection active; no forced retry' };
  }
  if (Number(apiGuard?.derateLevel || 0) > 0) {
    return { state, action: 'DERATING', reason: `Adaptive throttle level ${apiGuard.derateLevel}` };
  }
  if (attemptAge > STALL_AFTER_MS) {
    return { state: 'STALLED', action: 'REPAIRING', reason: 'No recent scheduler heartbeat; clear stale internal guard state and use next normal cycle' };
  }
  if (failures > 0) {
    return { state, action: 'RECOVERING', reason: 'Known transient failure; verify on the next successful fresh scan' };
  }
  if (health?.watchdogAction === 'VERIFYING') {
    return { state, action: 'VERIFYING', reason: 'Waiting for fresh scan advancement verification' };
  }
  return { state, action: 'NONE', reason: 'Healthy' };
}

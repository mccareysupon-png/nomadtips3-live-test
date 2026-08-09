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

export const ENGINE_MODES = Object.freeze(['RUNNING', 'MAINTENANCE', 'STOPPED']);
export const WATCHDOG_INTERVAL_MS = 15 * 60_000;
export const STALL_AFTER_MS = 7 * 60_000;
export const NEEDS_ADD_K_FAILURES = 10;

let schemaReady = false;

function iso(value) {
  const number = Number(value || 0);
  return number > 0 ? new Date(number).toISOString() : null;
}

function cleanMessage(error) {
  const message = String(error?.message || error || 'Unknown engine error').trim();
  return message || 'Unknown engine error';
}

export function classifyEngineError(error) {
  const message = cleanMessage(error);
  const text = message.toLowerCase();
  if (/429|too many requests|rate.?limit/.test(text)) return { code: 'API_429', message };
  if (/cooldown/.test(text)) return { code: 'API_COOLDOWN', message };
  if (/abort|timeout|timed out/.test(text)) return { code: 'TIMEOUT', message };
  if (/d1|sqlite|database|db /.test(text)) return { code: 'D1', message };
  if (/live scan http/.test(text)) return { code: 'BASE_SCAN_HTTP', message };
  if (/api http/.test(text)) return { code: 'API_HTTP', message };
  if (/fetch/.test(text)) return { code: 'FETCH', message };
  return { code: 'BASE_SCAN', message };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(ENGINE_CONTROL_SQL),
    env.DB.prepare(ENGINE_HEALTH_SQL),
    env.DB.prepare(`
      INSERT OR IGNORE INTO engine_control (id, mode, changed_at, changed_by)
      VALUES (1, 'RUNNING', ?, 'SYSTEM')
    `).bind(now),
    env.DB.prepare(`
      INSERT OR IGNORE INTO engine_health (
        id, consecutive_failures, updated_at
      ) VALUES (1, 0, ?)
    `).bind(now)
  ]);
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
  return getEngineControl(env);
}

export async function recordEngineAttempt(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_attempt_at = ?, updated_at = ?
    WHERE id = 1
  `).bind(at, at).run();
}

export async function recordEngineSuccess(env, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_success_at = ?, last_error = NULL, last_error_code = NULL,
        consecutive_failures = 0, updated_at = ?
    WHERE id = 1
  `).bind(at, at).run();
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

export async function recordRecovery(env, result, at = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare(`
    UPDATE engine_health
    SET last_recovery_at = ?, last_recovery_result = ?, updated_at = ?
    WHERE id = 1
  `).bind(at, String(result || 'RECOVERY ATTEMPTED'), at).run();
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
  if (failures >= NEEDS_ADD_K_FAILURES) return 'NEEDS_ADD_K';
  if (attemptAge > STALL_AFTER_MS) return 'STALLED';
  if (failures > 0 || successAge > STALL_AFTER_MS) return 'DEGRADED';
  return 'RUNNING';
}

export function watchdogDue(health, now = Date.now()) {
  return !health?.lastWatchdogMs || now - health.lastWatchdogMs >= WATCHDOG_INTERVAL_MS;
}

export function watchdogPlan(control, health, now = Date.now()) {
  const state = healthState(control, health, now);
  const attemptAge = health?.lastAttemptMs ? now - health.lastAttemptMs : Infinity;
  const failures = Number(health?.consecutiveFailures || 0);
  const errorCode = String(health?.lastErrorCode || '');

  if (control?.mode !== 'RUNNING') {
    return { state, action: 'NONE', reason: `Owner mode ${control?.mode || 'UNKNOWN'}` };
  }
  if (['API_429', 'API_COOLDOWN'].includes(errorCode)) {
    return { state, action: 'WAIT', reason: 'API guard is protecting the provider; do not force extra requests' };
  }
  if (attemptAge > STALL_AFTER_MS) {
    return { state, action: 'RECOVER_ON_NEXT_CYCLE', reason: 'No recent scheduler heartbeat' };
  }
  if (failures >= NEEDS_ADD_K_FAILURES) {
    return { state: 'NEEDS_ADD_K', action: 'NONE', reason: 'Repeated failures require code inspection' };
  }
  if (failures > 0) {
    return { state, action: 'RETRY_NEXT_CYCLE', reason: 'Known transient failure; normal cron retry is safest' };
  }
  return { state, action: 'NONE', reason: 'Healthy' };
}

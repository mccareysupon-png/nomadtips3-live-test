import car3Entry from './car3-entry.js';
import { getActiveConditionConfig } from './condition-config.js';
import {
  recordWatchdogEvent,
  setWatchdogAction
} from './engine-control.js';

const AUDIT_STALE_MS = 2 * 60_000;
const ACTIVE_STATE_MS = 15 * 60_000;

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

async function ensureAuditSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (auditSchemaReady) return;
  await env.DB.prepare(AUDIT_TABLE_SQL).run();
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

function rowToAudit(row) {
  if (!row) return null;
  const mismatches = parseMismatches(row.mismatches_json);
  return {
    ok: Boolean(Number(row.ok)),
    status: Number(row.ok) ? 'OK' : 'NEEDS_ADD_K',
    checkedAt: iso(row.checked_at),
    checkedAtMs: Number(row.checked_at || 0),
    configVersion: Number(row.config_version || 0),
    scannedStates: Number(row.scanned_states || 0),
    expectedTriggers: Number(row.expected_triggers || 0),
    dailySignals: Number(row.daily_signals || 0),
    signalLimitReached: Boolean(Number(row.signal_limit_reached)),
    mismatchCount: mismatches.length,
    mismatches,
    mode: 'NO_EXTRA_FOOTBALL_API'
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
    Number(item.fixtureId || 0),
    String(item.selectedSide || '')
  ]));
}

async function runConditionAudit(env) {
  await ensureAuditSchema(env);
  const now = Date.now();
  const config = await getActiveConditionConfig(env);
  const previousRow = await env.DB.prepare('SELECT * FROM condition_audit_status WHERE id = 1').first().catch(() => null);
  const previous = rowToAudit(previousRow);

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

  const ok = mismatches.length === 0;
  await env.DB.prepare(`
    INSERT INTO condition_audit_status (
      id, checked_at, ok, config_version, scanned_states, expected_triggers,
      daily_signals, signal_limit_reached, mismatches_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      checked_at = excluded.checked_at,
      ok = excluded.ok,
      config_version = excluded.config_version,
      scanned_states = excluded.scanned_states,
      expected_triggers = excluded.expected_triggers,
      daily_signals = excluded.daily_signals,
      signal_limit_reached = excluded.signal_limit_reached,
      mismatches_json = excluded.mismatches_json,
      updated_at = excluded.updated_at
  `).bind(
    now,
    ok ? 1 : 0,
    Number(config.version || 0),
    states.length,
    expectedTriggers,
    dailySignals,
    signalLimitReached ? 1 : 0,
    JSON.stringify(mismatches.slice(0, 20)),
    now
  ).run();

  const previousSignature = mismatchSignature(previous?.mismatches || []);
  const currentSignature = mismatchSignature(mismatches);
  if (!ok && (!previous || previous.ok || previousSignature !== currentSignature)) {
    const detail = `Condition Audit found ${mismatches.length} mismatch(es): ${mismatches.slice(0, 3).map(item => `${item.code} fixture ${item.fixtureId}/${item.selectedSide}`).join(', ')}`;
    await setWatchdogAction(env, 'NEEDS_ADD_K', detail, now);
    await recordWatchdogEvent(env, 'CONDITION_AUDIT_NEEDS_ADD_K', 'NEEDS_ADD_K', 'CONDITION_AUDIT', detail, now);
  } else if (ok && previous && !previous.ok) {
    await recordWatchdogEvent(env, 'CONDITION_AUDIT_RECOVERED', 'RUNNING', null, 'Condition trigger/state/signal consistency recovered', now);
  }

  return {
    ok,
    status: ok ? 'OK' : 'NEEDS_ADD_K',
    checkedAt: new Date(now).toISOString(),
    checkedAtMs: now,
    configVersion: Number(config.version || 0),
    scannedStates: states.length,
    expectedTriggers,
    dailySignals,
    signalLimitReached,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 20),
    mode: 'NO_EXTRA_FOOTBALL_API'
  };
}

async function currentAudit(env) {
  const audit = await getAuditStatus(env).catch(() => null);
  if (!audit || Date.now() - Number(audit.checkedAtMs || 0) > AUDIT_STALE_MS) {
    return runConditionAudit(env).catch(error => ({
      ok: false,
      status: 'AUDIT_ERROR',
      checkedAt: new Date().toISOString(),
      mismatchCount: 0,
      mismatches: [],
      error: error?.message || String(error),
      mode: 'NO_EXTRA_FOOTBALL_API'
    }));
  }
  return audit;
}

function responseWithAudit(response, payload, audit) {
  const data = payload && typeof payload === 'object' ? { ...payload, conditionAudit: audit } : payload;
  if (data && audit?.status === 'NEEDS_ADD_K') {
    data.state = 'NEEDS_ADD_K';
    if (data.watchdog && typeof data.watchdog === 'object') {
      const reason = `Condition Audit: ${audit.mismatchCount} mismatch(es) · ${audit.mismatches?.[0]?.code || 'CHECK REQUIRED'}`;
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
          .then(() => runConditionAudit(env))
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
    const audit = await currentAudit(env);
    return responseWithAudit(response, payload, audit);
  },

  async scheduled(controller, env, ctx) {
    return car3Entry.scheduled(controller, env, makeAuditContext(env, ctx));
  }
};

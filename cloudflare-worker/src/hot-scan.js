import { getActiveConditionConfig } from './condition-config.js';

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function candidateKey(candidate) {
  return `${Number(candidate.fixtureId)}:${String(candidate.selectedSide || 'HOME')}`;
}

function startOfThaiDay(now) {
  const offset = 7 * 60 * 60_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

function clampRefresh(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 60;
  if (n <= 5) return 5;
  if (n <= 15) return 15;
  if (n <= 30) return 30;
  if (n <= 60) return 60;
  return 240;
}

async function fetchBaseScan(baseWorker, env, ctx) {
  const request = new Request('https://internal.nomadtips3/live-condition-scan?source=hot-zone', {
    method: 'GET'
  });
  const response = await baseWorker.fetch(request, env, ctx);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Hot scan HTTP ${response.status}`);
  }
  return payload;
}

async function statesByCandidates(env, candidates) {
  const map = new Map();
  const ids = [...new Set(candidates.map(item => Number(item.fixtureId)).filter(Number.isInteger))];
  for (let index = 0; index < ids.length; index += 50) {
    const group = ids.slice(index, index + 50);
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT state_key, fixture_id, selected_side, last_home_percent, streak,
             triggered, config_version, updated_at
      FROM auto_momentum_state_side
      WHERE fixture_id IN (${placeholders})
    `).bind(...group).all();
    for (const row of result.results || []) map.set(String(row.state_key), row);
  }
  return map;
}

async function existingSignalKeys(env, candidates) {
  const set = new Set();
  const ids = [...new Set(candidates.map(item => Number(item.fixtureId)).filter(Number.isInteger))];
  for (let index = 0; index < ids.length; index += 50) {
    const group = ids.slice(index, index + 50);
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT signal_key FROM condition_signals WHERE fixture_id IN (${placeholders})
    `).bind(...group).all();
    for (const row of result.results || []) set.add(String(row.signal_key));
  }
  return set;
}

function signalStatement(env, candidate, state, now) {
  const key = candidateKey(candidate);
  const momentum = numeric(state?.last_home_percent);
  const payload = {
    fixtureId: Number(candidate.fixtureId),
    selectedSide: String(candidate.selectedSide || 'HOME'),
    selectedTeam: candidate.home,
    opponent: candidate.away,
    minute: Number(candidate.minute),
    score: candidate.score,
    momentum,
    selectedOdds: numeric(candidate?.markets?.selectedOdds),
    ahLine: numeric(candidate?.markets?.homeAh),
    ahOdds: numeric(candidate?.markets?.homeAhOdds),
    createdAt: now,
    source: 'adaptive-hot-zone'
  };

  return env.DB.prepare(`
    INSERT OR IGNORE INTO condition_signals (
      signal_key, fixture_id, selected_side, selected_team, opponent, minute,
      selected_score, opponent_score, momentum, selected_odds, ah_line, ah_odds,
      payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    key,
    Number(candidate.fixtureId),
    String(candidate.selectedSide || 'HOME'),
    String(candidate.home || 'Selected'),
    String(candidate.away || 'Opponent'),
    Number(candidate.minute),
    Number(candidate.score?.home || 0),
    Number(candidate.score?.away || 0),
    momentum,
    numeric(candidate?.markets?.selectedOdds),
    numeric(candidate?.markets?.homeAh),
    numeric(candidate?.markets?.homeAhOdds),
    JSON.stringify(payload),
    now
  );
}

export async function runHotConditionScan(baseWorker, env, ctx) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');

  const now = Date.now();
  const [payload, config] = await Promise.all([
    fetchBaseScan(baseWorker, env, ctx),
    getActiveConditionConfig(env)
  ]);
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!candidates.length) {
    return {
      ok: true,
      generatedAt: new Date(now).toISOString(),
      refreshSeconds: clampRefresh(payload.refreshSeconds),
      candidates: 0,
      ready: 0,
      newSignals: 0
    };
  }

  const [states, existing, todayRow] = await Promise.all([
    statesByCandidates(env, candidates),
    existingSignalKeys(env, candidates),
    env.DB.prepare('SELECT COUNT(*) AS total FROM condition_signals WHERE created_at >= ?')
      .bind(startOfThaiDay(now)).first()
  ]);

  let dailySignals = Number(todayRow?.total || 0);
  let ready = 0;
  let newSignals = 0;
  const statements = [];

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const state = states.get(key);
    if (!state) continue;
    if (Number(state.config_version || 0) !== Number(config.version || 0)) continue;
    if (Number(state.streak || 0) < Number(config.confirmationRounds || 1)) continue;
    ready += 1;

    if (Number(state.triggered || 0) || existing.has(key)) continue;
    if (config.signalLimitEnabled && dailySignals >= config.maxSignalsPerDay) continue;

    statements.push(signalStatement(env, candidate, state, now));
    statements.push(
      env.DB.prepare(`
        UPDATE auto_momentum_state_side
        SET triggered = 1, updated_at = ?
        WHERE state_key = ? AND config_version = ?
      `).bind(now, key, Number(config.version || 0))
    );
    existing.add(key);
    dailySignals += 1;
    newSignals += 1;
  }

  for (let index = 0; index < statements.length; index += 80) {
    await env.DB.batch(statements.slice(index, index + 80));
  }

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    refreshSeconds: clampRefresh(payload.refreshSeconds),
    candidates: candidates.length,
    ready,
    newSignals,
    dailySignals
  };
}

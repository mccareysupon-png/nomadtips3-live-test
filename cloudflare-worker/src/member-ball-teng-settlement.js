import { sharedApiFetch } from './shared-api-football.js';
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const VOID = new Set(['CANC', 'ABD']);
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const RESULT_SQL = `
CREATE TABLE IF NOT EXISTS member_prediction_results (
  member_id TEXT NOT NULL,
  result_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  fixture_id INTEGER,
  market TEXT NOT NULL DEFAULT '1X2',
  pick TEXT,
  odds REAL,
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  PRIMARY KEY (member_id, result_key)
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(RESULT_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_result_pending ON member_prediction_results(source_type, outcome, fixture_id)')
  ]);
  schemaReady = true;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function finite(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function normalized(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ก-๙]+/g, ' ')
    .trim();
}

function selectedSide(row, payload) {
  const direct = String(payload?.pick_side || payload?.pickSide || payload?.selected_side || '').toUpperCase();
  if (['HOME', 'AWAY', 'DRAW'].includes(direct)) return direct;

  const pick = normalized(payload?.pick || row?.pick);
  if (!pick) return null;
  if (/\bdraw\b|เสมอ/.test(pick)) return 'DRAW';

  const home = normalized(payload?.home || payload?.homeTeam);
  const away = normalized(payload?.away || payload?.awayTeam);
  if (home && pick.includes(home)) return 'HOME';
  if (away && pick.includes(away)) return 'AWAY';
  return null;
}

function settleOne(row, payload, fixture) {
  const status = String(fixture?.fixture?.status?.short || '').toUpperCase();
  const homeScore = fixture?.goals?.home;
  const awayScore = fixture?.goals?.away;
  const side = selectedSide(row, payload);

  if (VOID.has(status)) {
    return { outcome: 'VOID', status, homeScore: finite(homeScore) ? Number(homeScore) : null, awayScore: finite(awayScore) ? Number(awayScore) : null, side };
  }
  if (!FINISHED.has(status) || !finite(homeScore) || !finite(awayScore) || !side) return null;

  const home = Number(homeScore);
  const away = Number(awayScore);
  const correct = (side === 'HOME' && home > away)
    || (side === 'AWAY' && away > home)
    || (side === 'DRAW' && home === away);
  return { outcome: correct ? 'CORRECT' : 'INCORRECT', status, homeScore: home, awayScore: away, side };
}

function kickoffMs(payload) {
  const provider = Date.parse(payload?.memberResult?.providerKickoffUtc || '');
  if (Number.isFinite(provider)) return provider;
  const selected = Date.parse(payload?.kickoff_utc || payload?.kickoffUtc || '');
  return Number.isFinite(selected) ? selected : null;
}

function dueForCheck(row, payload, now) {
  const kickoff = kickoffMs(payload);
  const created = Number(row?.created_at || 0);
  const earliest = kickoff === null ? created + 3 * 60 * 60_000 : kickoff + 95 * 60_000;
  if (now < earliest) return false;

  const lastChecked = Date.parse(payload?.memberResult?.lastCheckedAt || '');
  if (!Number.isFinite(lastChecked)) return true;
  const lastStatus = String(payload?.memberResult?.providerStatus || '').toUpperCase();
  const interval = ['NS', 'TBD', 'PST'].includes(lastStatus)
    ? 6 * 60 * 60_000
    : LIVE.has(lastStatus)
      ? 5 * 60_000
      : 15 * 60_000;
  return now - lastChecked >= interval;
}

async function fetchFixtures(env, ids) {
  const result = await sharedApiFetch(`/fixtures?ids=${ids.join('-')}`, env, 60);
  return Array.isArray(result.payload?.response) ? result.payload.response : [];
}

function fixtureId(item) {
  return Math.round(Number(item?.fixture?.id || 0));
}

function resultMeta(payload, fixture, now, settlement = null) {
  const providerStatus = String(fixture?.fixture?.status?.short || '').toUpperCase();
  return {
    ...(payload?.memberResult || {}),
    source: 'API-FOOTBALL',
    lastCheckedAt: new Date(now).toISOString(),
    providerStatus,
    providerStatusLong: fixture?.fixture?.status?.long || null,
    providerKickoffUtc: fixture?.fixture?.date || payload?.memberResult?.providerKickoffUtc || payload?.kickoff_utc || payload?.kickoffUtc || null,
    homeScore: finite(fixture?.goals?.home) ? Number(fixture.goals.home) : null,
    awayScore: finite(fixture?.goals?.away) ? Number(fixture.goals.away) : null,
    resultConfirmed: Boolean(settlement),
    outcome: settlement?.outcome || payload?.memberResult?.outcome || 'PENDING',
    selectedSide: settlement?.side || payload?.memberResult?.selectedSide || null,
    settledAt: settlement ? new Date(now).toISOString() : null
  };
}

export async function settlePendingMemberBallTengResults(env) {
  await ensureSchema(env);
  const now = Date.now();
  const rows = await env.DB.prepare(`
    SELECT member_id, result_key, fixture_id, pick, outcome, payload_json, created_at
    FROM member_prediction_results
    WHERE source_type = 'BALL_TENG' AND UPPER(outcome) = 'PENDING' AND fixture_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 500
  `).all();

  const candidates = (rows.results || [])
    .map(row => ({ row, payload: parseJson(row.payload_json, {}) }))
    .filter(item => dueForCheck(item.row, item.payload, now));

  if (!candidates.length) return { ok: true, checked: 0, settled: 0, pending: 0 };

  const byFixture = new Map();
  for (const item of candidates) {
    const id = Math.round(Number(item.row.fixture_id || 0));
    if (!id) continue;
    if (!byFixture.has(id)) byFixture.set(id, []);
    byFixture.get(id).push(item);
  }

  let checked = 0;
  let settled = 0;
  for (const ids of Array.from(byFixture.keys()).reduce((groups, id, index) => {
    const group = Math.floor(index / 20);
    if (!groups[group]) groups[group] = [];
    groups[group].push(id);
    return groups;
  }, [])) {
    const fixtures = await fetchFixtures(env, ids);
    const map = new Map(fixtures.map(item => [fixtureId(item), item]));
    const statements = [];

    for (const id of ids) {
      const fixture = map.get(id);
      if (!fixture) continue;
      for (const item of byFixture.get(id) || []) {
        checked += 1;
        const settlement = settleOne(item.row, item.payload, fixture);
        const nextPayload = {
          ...item.payload,
          memberResult: resultMeta(item.payload, fixture, now, settlement)
        };
        if (settlement) {
          settled += 1;
          statements.push(env.DB.prepare(`
            UPDATE member_prediction_results
            SET outcome = ?, payload_json = ?, settled_at = ?
            WHERE member_id = ? AND result_key = ? AND UPPER(outcome) = 'PENDING'
          `).bind(settlement.outcome, JSON.stringify(nextPayload), now, item.row.member_id, item.row.result_key));
        } else {
          statements.push(env.DB.prepare(`
            UPDATE member_prediction_results
            SET payload_json = ?
            WHERE member_id = ? AND result_key = ? AND UPPER(outcome) = 'PENDING'
          `).bind(JSON.stringify(nextPayload), item.row.member_id, item.row.result_key));
        }
      }
    }

    for (let index = 0; index < statements.length; index += 80) {
      await env.DB.batch(statements.slice(index, index + 80));
    }
  }

  return { ok: true, checked, settled, pending: Math.max(0, candidates.length - settled) };
}

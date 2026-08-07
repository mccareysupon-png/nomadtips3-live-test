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

const PAGE_SIZE = 50;
let schemaReady = false;

function memberIdFromUrl(url) {
  const raw = String(url.searchParams.get('member') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(raw)) return null;
  return raw.padStart(4, '0');
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(RESULT_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_result_created ON member_prediction_results(member_id, created_at)')
  ]);
  schemaReady = true;
}

async function summary(env, memberId) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN UPPER(COALESCE(outcome, '')) NOT IN ('', 'PENDING', 'WAITING') THEN 1 ELSE 0 END) AS settled,
      SUM(CASE WHEN UPPER(COALESCE(outcome, '')) IN ('CORRECT', 'WIN', 'HALF-WIN') THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN UPPER(COALESCE(outcome, '')) IN ('INCORRECT', 'LOSS', 'HALF-LOSS') THEN 1 ELSE 0 END) AS incorrect,
      SUM(CASE WHEN UPPER(COALESCE(outcome, '')) IN ('', 'PENDING', 'WAITING') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN UPPER(COALESCE(outcome, '')) IN ('PUSH', 'VOID') THEN 1 ELSE 0 END) AS push_void,
      AVG(CASE
        WHEN UPPER(COALESCE(outcome, '')) IN ('CORRECT', 'WIN', 'HALF-WIN', 'INCORRECT', 'LOSS', 'HALF-LOSS')
             AND odds IS NOT NULL AND odds > 0
        THEN odds ELSE NULL END) AS avg_odds
    FROM member_prediction_results
    WHERE member_id = ?
  `).bind(memberId).first();

  const correct = Number(row?.correct || 0);
  const incorrect = Number(row?.incorrect || 0);
  const decisions = correct + incorrect;
  return {
    total: Number(row?.total || 0),
    settled: Number(row?.settled || 0),
    correct,
    incorrect,
    pending: Number(row?.pending || 0),
    pushVoid: Number(row?.push_void || 0),
    avgOdds: row?.avg_odds == null ? null : Number(row.avg_odds),
    accuracy: decisions ? (correct / decisions) * 100 : null
  };
}

async function page(env, memberId, requestedPage) {
  await ensureSchema(env);
  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM member_prediction_results
    WHERE member_id = ?
  `).bind(memberId).first();
  const total = Number(countRow?.total || 0);
  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;
  const pageNumber = totalPages
    ? Math.min(positiveInteger(requestedPage, 1), totalPages)
    : 1;
  const offset = (pageNumber - 1) * PAGE_SIZE;

  const rows = await env.DB.prepare(`
    SELECT result_key, source_type, fixture_id, market, pick, odds, outcome,
           payload_json, created_at, settled_at
    FROM member_prediction_results
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(memberId, PAGE_SIZE, offset).all();

  return {
    records: (rows.results || []).map(row => ({ ...row, payload: parseJson(row.payload_json) })),
    pagination: {
      page: pageNumber,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
      hasPrevious: pageNumber > 1,
      hasNext: totalPages > 0 && pageNumber < totalPages
    }
  };
}

export async function handleMemberStatsPagination(request, env, url) {
  if (request.method !== 'GET') {
    return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  }
  const memberId = memberIdFromUrl(url);
  if (!memberId) {
    return { status: 400, data: { ok: false, error: 'Valid member id is required' } };
  }

  if (url.pathname === '/member-stats-summary') {
    return {
      status: 200,
      data: { ok: true, memberId, scope: 'MEMBER_ONLY', summary: await summary(env, memberId) }
    };
  }

  if (url.pathname === '/member-stats-page') {
    const result = await page(env, memberId, url.searchParams.get('page'));
    return {
      status: 200,
      data: { ok: true, memberId, scope: 'MEMBER_ONLY', ...result }
    };
  }

  return { status: 404, data: { ok: false, error: 'Member statistics endpoint not found' } };
}

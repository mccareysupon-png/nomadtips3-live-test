import { handleMemberConfig, normalizeMemberId } from './member-config.js';

const DAILY_RUN_LIMIT = 3;
const RUN_QUOTA_SQL = `
CREATE TABLE IF NOT EXISTS member_ball_teng_run_quota (
  member_id TEXT NOT NULL,
  run_day TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_requested_version INTEGER NOT NULL DEFAULT 0,
  last_requested_at INTEGER,
  PRIMARY KEY (member_id, run_day)
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(RUN_QUOTA_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_ball_teng_quota_member ON member_ball_teng_run_quota(member_id, last_requested_at)')
  ]);
  schemaReady = true;
}

function memberIdFromUrl(url) {
  return normalizeMemberId(url.searchParams.get('member'));
}

function bangkokDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now));
  const read = type => Number(parts.find(part => part.type === type)?.value || 0);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const resetAt = new Date(Date.UTC(year, month - 1, day + 1, -7, 0, 0)).toISOString();
  return { key, resetAt };
}

async function latestStoredConfigVersion(env, memberId) {
  try {
    const row = await env.DB.prepare(`
      SELECT config_version
      FROM member_ball_teng_sets
      WHERE member_id = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).bind(memberId).first();
    return Number(row?.config_version || 0);
  } catch {
    return 0;
  }
}

async function latestRequest(env, memberId) {
  return env.DB.prepare(`
    SELECT run_day, run_count, last_requested_version, last_requested_at
    FROM member_ball_teng_run_quota
    WHERE member_id = ?
    ORDER BY last_requested_at DESC
    LIMIT 1
  `).bind(memberId).first();
}

async function quotaState(env, memberId, now = Date.now()) {
  await ensureSchema(env);
  const day = bangkokDay(now);
  const row = await env.DB.prepare(`
    SELECT run_count, last_requested_version, last_requested_at
    FROM member_ball_teng_run_quota
    WHERE member_id = ? AND run_day = ?
  `).bind(memberId, day.key).first();
  const latest = await latestRequest(env, memberId);
  const storedVersion = await latestStoredConfigVersion(env, memberId);
  const requestedVersion = Number(latest?.last_requested_version || 0);
  const pending = requestedVersion > 0 && storedVersion < requestedVersion;
  const used = Math.max(0, Number(row?.run_count || 0));
  return {
    day: day.key,
    limit: DAILY_RUN_LIMIT,
    used,
    remaining: Math.max(0, DAILY_RUN_LIMIT - used),
    resetAt: day.resetAt,
    pending,
    pendingConfigVersion: pending ? requestedVersion : null,
    lastRequestedAt: latest?.last_requested_at ? new Date(Number(latest.last_requested_at)).toISOString() : null
  };
}

async function recordRun(env, memberId, configVersion, now = Date.now()) {
  const day = bangkokDay(now);
  await env.DB.prepare(`
    INSERT INTO member_ball_teng_run_quota (
      member_id, run_day, run_count, last_requested_version, last_requested_at
    ) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(member_id, run_day) DO UPDATE SET
      run_count = member_ball_teng_run_quota.run_count + 1,
      last_requested_version = excluded.last_requested_version,
      last_requested_at = excluded.last_requested_at
  `).bind(memberId, day.key, Number(configVersion || 0), now).run();
}

export async function handleMemberBallTengRun(request, env, url) {
  await ensureSchema(env);
  const memberId = memberIdFromUrl(url);
  if (!memberId) return { status: 400, data: { ok: false, error: 'Valid member id is required' } };

  if (request.method === 'GET') {
    return {
      status: 200,
      data: {
        ok: true,
        scope: 'MEMBER_ONLY',
        memberId,
        quota: await quotaState(env, memberId)
      }
    };
  }

  if (request.method !== 'POST') {
    return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.config || typeof body.config !== 'object') {
    return { status: 400, data: { ok: false, error: 'Ball Teng config is required' } };
  }

  const before = await quotaState(env, memberId);
  if (before.pending) {
    return {
      status: 409,
      data: {
        ok: false,
        error: 'มีคำสั่งคัดบอลเต็งของคุณกำลังประมวลผลอยู่ กรุณารอผลชุดนี้ก่อนกดคัดใหม่',
        scope: 'MEMBER_ONLY',
        memberId,
        quota: before
      }
    };
  }
  if (before.remaining <= 0) {
    return {
      status: 429,
      data: {
        ok: false,
        error: `วันนี้ใช้สิทธิ์คัดบอลเต็งครบ ${DAILY_RUN_LIMIT} ครั้งแล้ว`,
        scope: 'MEMBER_ONLY',
        memberId,
        quota: before
      }
    };
  }

  const internalUrl = new URL(`https://internal.nomadtips3/member-ball-teng-config?member=${encodeURIComponent(memberId)}`);
  const internalRequest = new Request(internalUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run', config: body.config })
  });
  const activated = await handleMemberConfig(internalRequest, env, internalUrl);
  if (activated.status !== 200 || !activated.data?.ok) return activated;

  const version = Number(activated.data.version || 0);
  const now = Date.now();
  await recordRun(env, memberId, version, now);
  const after = await quotaState(env, memberId, now);

  return {
    status: 200,
    data: {
      ...activated.data,
      ok: true,
      scope: 'MEMBER_ONLY',
      memberId,
      selectionQueued: true,
      quota: after,
      message: `เปิดใช้เงื่อนไขของ Member ${memberId} แล้ว และส่งคำสั่งคัดใหม่ (${after.used}/${after.limit} ครั้งวันนี้) เครื่องคัดสมาชิกจะรับงานในรอบถัดไป โดยไม่กระทบ Owner/System.`
    }
  };
}

const SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS jeng_money_recipient (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(SETTINGS_SQL).run();
  schemaReady = true;
}

export async function setJengMoneyRecipient(env, userId, active = true) {
  const normalized = String(userId || '').trim();
  if (!normalized) throw new Error('LINE user id is required');
  await ensureSchema(env);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO jeng_money_recipient (id, user_id, active, updated_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).bind(normalized, active ? 1 : 0, now).run();
  return { userId: normalized, active: Boolean(active), updatedAt: now };
}

export async function getJengMoneyRecipient(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT user_id, active, updated_at
    FROM jeng_money_recipient
    WHERE id = 1
  `).first();
  if (!row || Number(row.active) !== 1 || !String(row.user_id || '').trim()) return null;
  return {
    userId: String(row.user_id).trim(),
    active: true,
    updatedAt: Number(row.updated_at || 0)
  };
}

export async function disableJengMoneyRecipient(env, userId = '') {
  await ensureSchema(env);
  const current = await env.DB.prepare(`
    SELECT user_id FROM jeng_money_recipient WHERE id = 1
  `).first();
  if (!current?.user_id) return { active: false, changed: false };
  const requested = String(userId || '').trim();
  if (requested && String(current.user_id) !== requested) {
    return { active: false, changed: false, ownerMismatch: true };
  }
  await env.DB.prepare(`
    UPDATE jeng_money_recipient
    SET active = 0, updated_at = ?
    WHERE id = 1
  `).bind(Date.now()).run();
  return { active: false, changed: true };
}

export async function withJengMoneyRecipient(env) {
  const recipient = await getJengMoneyRecipient(env).catch(() => null);
  if (!recipient?.userId) return env;
  const scoped = Object.create(env);
  scoped.JENG_LINE_USER_ID = recipient.userId;
  return scoped;
}

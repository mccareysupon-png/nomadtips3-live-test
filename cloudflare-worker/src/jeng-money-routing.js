import { notifyJengMoneyLineEvents } from './jeng-money.js';

export async function runJengMoneyRouting(env) {
  const userId = String(
    env.JENG_LINE_USER_ID || env.LINE_TARGET_ID || env.LINE_USER_ID || ''
  ).trim();

  if (!userId || !env.DB) {
    return { configured: false, sent: 0, reason: 'JENG_LINE_USER_ID_NOT_CONFIGURED' };
  }

  // The personal JENG recipient must not also receive the generic all-signal stream.
  // Keep the same LINE Official Account, but route this user through JENG only.
  await env.DB.prepare(`
    UPDATE line_subscribers
    SET active = 0, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(Date.now(), userId).run().catch(() => null);

  const scopedEnv = Object.create(env);
  scopedEnv.JENG_LINE_USER_ID = userId;
  return notifyJengMoneyLineEvents(scopedEnv);
}

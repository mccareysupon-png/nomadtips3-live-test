import { notifyJengMoneyLineEvents } from './jeng-money.js';
import { getJengMoneyRecipient } from './jeng-money-recipient.js';

export async function runJengMoneyRouting(env) {
  if (!env.DB) return { configured: false, sent: 0, reason: 'D1_NOT_CONFIGURED' };

  const recipient = await getJengMoneyRecipient(env).catch(() => null);
  const userId = String(recipient?.userId || '').trim();
  if (!userId) {
    return { configured: false, sent: 0, reason: 'JENG_LINE_RECIPIENT_NOT_REGISTERED' };
  }

  // Keep the same LINE Official Account, but route this owner through JENG only.
  // This prevents the owner from receiving both the generic all-signal stream and
  // the personal five-signal window at the same time.
  await env.DB.prepare(`
    UPDATE line_subscribers
    SET active = 0, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(Date.now(), userId).run().catch(() => null);

  const scopedEnv = Object.create(env);
  scopedEnv.JENG_LINE_USER_ID = userId;
  return notifyJengMoneyLineEvents(scopedEnv);
}

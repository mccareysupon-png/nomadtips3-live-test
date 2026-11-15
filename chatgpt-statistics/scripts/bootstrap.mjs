// Read actual BALL46 Production ledger with GET only, once, into a separate staging DB.
// Never schedule this full-ledger scan. Routine updates require verified delta/settlement events.
const target = process.env.B46_CHAT_STAGING_URL;
const token = process.env.B46_CHAT_STAGING_TOKEN;
if (!target || !token) throw new Error('SET_B46_CHAT_STAGING_URL_AND_TOKEN');
const api = 'https://ball46.com/api/engine/statistics?paged=1';
const seenCursors = new Set();
let cursor = null, expectedSignature = null, pages = 0, imported = 0, changed = 0;
while (true) {
  if (++pages > 5000) throw new Error('PAGE_LIMIT_EXCEEDED');
  const source = new URL(api);
  if (cursor) source.searchParams.set('cursor', cursor);
  const r = await fetch(source, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('REAL_SOURCE_HTTP_' + r.status);
  const data = await r.json();
  if (data?.ok !== true || !Array.isArray(data.rows)) throw new Error('UNVERIFIED_REAL_SOURCE_CONTRACT');
  const signature = JSON.stringify([data.ledgerTotal,data.total,data.pending,data.unresolved,
    data.win,data.loss,data.push,data.halfWin,data.halfLoss,data.ledgerUpdatedAt]);
  if (expectedSignature && expectedSignature !== signature) throw new Error('REAL_SOURCE_CHANGED_DURING_IMPORT');
  expectedSignature = signature;
  for (let i = 0; i < data.rows.length; i += 60) {
    const rows = data.rows.slice(i, i+60);
    const ack = await fetch(new URL('/admin/ingest', target), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'BALL46_PRODUCTION_READ_ONLY', rows }),
      signal: AbortSignal.timeout(30000)
    });
    const result = await ack.json();
    if (!ack.ok || !result.ok) throw new Error('STAGING_INGEST_FAILED_' + (result.error || ack.status));
    imported += rows.length;
    changed += result.changed;
  }
  if (!data.nextCursor) break;
  if (seenCursors.has(data.nextCursor)) throw new Error('REAL_SOURCE_CURSOR_CYCLE');
  seenCursors.add(data.nextCursor);
  cursor = data.nextCursor;
}
console.log(JSON.stringify({ source:'REAL_BALL46', complete:true, pages, imported, changed, expectedSignature }, null, 2));

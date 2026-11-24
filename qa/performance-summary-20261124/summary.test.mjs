import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayWindow, summaryIsUsable, valuesFor, verifyAndSummarize } from './summary.mjs';
import { bootData, cardHTML } from './card.mjs';

const stamp = value => Date.parse(value);
const now = stamp('2026-11-24T05:59:59Z');
const rows = [
  { id: '1', createdAt: '2026-11-23T06:00:00Z', result: 'HALF_WIN', status: 'SETTLED', odds: 1.9 },
  { id: '2', createdAt: stamp('2026-11-23T20:00:00Z') / 1000, result: 'HALF_LOSS', status: 'SETTLED', odds: 2.1 },
  { id: '3', createdAt: '2026-11-24T05:59:59Z', status: 'PENDING', odds: 2.3 },
  { id: '4', created_at: '2026-11-22T06:00:00Z', settledAt: now, result: 'WIN', status: 'SETTLED', odds: 1.8 },
  { id: '5', createdAt: '2026-11-22T10:00:00Z', status: 'PENDING', odds: 10 },
  { id: '6', createdAt: '2026-11-23T03:00:00Z', result: 'VOID', status: 'SETTLED', odds: 1 },
  { id: '7', createdAt: '2026-11-21T07:00:00Z', result: 'LOSS', status: 'SETTLED', odds: 2 },
  { id: '8', createdAt: '2026-11-23T08:00:00Z', status: 'UNRESOLVED', odds: 100 },
];
const base = {
  ok: true, ledgerTotal: 8, total: 4, pending: 2, unresolved: 1, win: 1, loss: 1,
  halfWin: 1, halfLoss: 1, push: 0, byMarket: {ft_over: 4},
};
const page = cursor => ({ ...base, rows: cursor ? rows.slice(4) : rows.slice(0, 4), nextCursor: cursor ? null : 'second' });

test('produces the legacy card counts from both verified ledger pages', async () => {
  const result = await verifyAndSummarize(page, () => now);
  const display = valuesFor(result, now);
  assert.equal(result.verifiedRows, 8);
  assert.deepEqual(result.today, {win:1, loss:1, push:0, pending:1, oddsSum:6.3, oddsCount:3});
  assert.deepEqual(result.yesterday, {win:1, loss:0, push:1, pending:0, oddsSum:1.8, oddsCount:1});
  assert.equal(display.fields['rate:today'], '50%');
  assert.equal(display.fields['rate:yesterday'], '100%');
  assert.equal(display.fields['avg-odds:today'], '2.10');
  assert.equal(display.fields['avg-odds:yesterday'], '1.80');
  assert.match(display.fields['label:today'], /^Live Summary · 23 NOV/);
  assert.match(cardHTML(display), /data-b46-rate="today" data-b46-rate-tone="neutral">50%</);
  assert.match(bootData(display), /"stat:today-pending":"1"/);
  assert(Buffer.byteLength(JSON.stringify(display)) < 2000);
});

test('rejects changed revisions, duplicate IDs, incomplete totals and a rollover while verifying', async () => {
  await assert.rejects(verifyAndSummarize(cursor => ({
    ...page(cursor), version: cursor ? 'B' : 'A',
  }), () => now), /revision changed/);
  await assert.rejects(verifyAndSummarize(cursor => ({
    ...page(cursor), rows: cursor ? [rows[0], ...rows.slice(5)] : page(cursor).rows,
  }), () => now), /duplicate/);
  await assert.rejects(verifyAndSummarize(cursor => ({
    ...page(cursor), rows: cursor ? rows.slice(5) : page(cursor).rows,
  }), () => now), /totals disagree/);
  let calls = 0;
  await assert.rejects(verifyAndSummarize(page, () => now + calls++ * 1000), /day changed/);
});

test('uses London 06:00 across GMT and BST and expires old-day displays', async () => {
  assert.equal(dayWindow(now).end, stamp('2026-11-24T06:00:00Z'));
  assert.equal(dayWindow(stamp('2026-03-29T04:59:59Z')).end, stamp('2026-03-29T05:00:00Z'));
  assert.equal(dayWindow(stamp('2026-10-25T05:59:59Z')).end, stamp('2026-10-25T06:00:00Z'));
  const result = await verifyAndSummarize(page, () => now - 180000);
  assert.equal(valuesFor(result, now).state, 'saved');
  assert.equal(summaryIsUsable(result, now + 1000), false);
  assert.equal(valuesFor(result, now + 1000).fields['rate:today'], '—');
});

test('last known data is distinct from a verified zero-result day', async () => {
  const view = valuesFor(null, now);
  assert.equal(view.state, 'waiting');
  assert.equal(view.fields['stat:today-win'], '—');
  const empty = await verifyAndSummarize(() => ({
    ...base, ledgerTotal:0, total:0, win:0, loss:0, halfWin:0, halfLoss:0, pending:0, unresolved:0, rows:[], nextCursor:null,
  }), () => now);
  assert.equal(valuesFor(empty, now).fields['stat:today-win'], '0');
  assert.equal(valuesFor(empty, now).fields['rate:today'], '—');
});

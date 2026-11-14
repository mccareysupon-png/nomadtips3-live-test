import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const D='work/statistics-summary-shadow-20261113';
let s=await readFile('work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js','utf8');
function one(a,b,label){assert.equal(s.split(a).length,2,'ENGINE_SOURCE_DRIFT:'+label);s=s.replace(a,b)}
one(`async latestLedgerRows(cursor = null) {
    const found = await this.ctx.storage.list({
      prefix: STAT_LEDGER_PREFIX,
      reverse: true,
      limit: STAT_LEDGER_PAGE_SIZE + 1,
      ...cursor ? { end: cursor } : {}
    });
    const entries = [...found.entries()];
    const more = entries.length > STAT_LEDGER_PAGE_SIZE;
    const included = more ? entries.slice(0, STAT_LEDGER_PAGE_SIZE) : entries;
    return {
      rows: included.map(([, value]) => value),
      nextCursor: more ? included[included.length - 1][0] : null
    };
  }
  async statisticsLedgerResponse(cursor = null, paged = false) {
    const meta = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    let page = await this.latestLedgerRows(cursor);`,
`async latestLedgerRows(cursor = null, pageSize = STAT_LEDGER_PAGE_SIZE) {
    const limit = Math.max(100, Math.min(2000, Number(pageSize) || STAT_LEDGER_PAGE_SIZE));
    const found = await this.ctx.storage.list({
      prefix: STAT_LEDGER_PREFIX,
      reverse: true,
      limit: limit + 1,
      ...cursor ? { end: cursor } : {}
    });
    const entries = [...found.entries()];
    const more = entries.length > limit;
    const included = more ? entries.slice(0, limit) : entries;
    return {
      rows: included.map(([, value]) => value),
      nextCursor: more ? included[included.length - 1][0] : null
    };
  }
  async statisticsLedgerResponse(cursor = null, paged = false, pageSize = STAT_LEDGER_PAGE_SIZE, pinnedMeta = null) {
    const meta = pinnedMeta || normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    let page = await this.latestLedgerRows(cursor, pageSize);`,'page-size');
one('page = await this.latestLedgerRows(page.nextCursor);','page = await this.latestLedgerRows(page.nextCursor, pageSize);','continuation-size');
one('ledgerUpdatedAt: meta.updatedAt, statisticsPagination: "CURSOR_NO_TOTAL_CAP_V1"','ledgerUpdatedAt: meta.updatedAt, statisticsGeneration: meta.updatedAt, statisticsPagination: "CURSOR_PINNED_GENERATION_V1"','generation-response');
one(`    if (u.pathname === "/statistics" && request.method === "GET") {
      const cursor = u.searchParams.get("cursor");
      if (cursor !== null && (!cursor.startsWith(STAT_LEDGER_PREFIX) || cursor.length > 1024))
        return Response.json({ ok: false, error: "INVALID_STATISTICS_CURSOR" }, { status: 400 });
      if (!cursor) {
        await this.scanIfDue();
        await this.syncStatisticsLedger();
      }
      return Response.json(await this.statisticsLedgerResponse(cursor, u.searchParams.get("paged") === "1" || cursor !== null));
    }`,
`    if (u.pathname === "/statistics" && request.method === "GET") {
      const cursor = u.searchParams.get("cursor");
      if (cursor !== null && (!cursor.startsWith(STAT_LEDGER_PREFIX) || cursor.length > 1024))
        return Response.json({ ok: false, error: "INVALID_STATISTICS_CURSOR" }, { status: 400 });
      if (!cursor) {
        await this.scanIfDue();
        await this.syncStatisticsLedger();
      }
      const rawLimit = Number(u.searchParams.get("limit"));
      const pageSize = Number.isSafeInteger(rawLimit) && rawLimit >= 100 && rawLimit <= 2000 ? rawLimit : STAT_LEDGER_PAGE_SIZE;
      const expectedGeneration = u.searchParams.get("generation");
      const before = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
      if (expectedGeneration !== null && String(before.updatedAt) !== String(expectedGeneration))
        return Response.json({ ok: false, error: "STATISTICS_GENERATION_CHANGED", statisticsGeneration: before.updatedAt }, { status: 409 });
      const result = await this.statisticsLedgerResponse(cursor, u.searchParams.get("paged") === "1" || cursor !== null, pageSize, before);
      const after = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
      if (String(after.updatedAt) !== String(before.updatedAt))
        return Response.json({ ok: false, error: "STATISTICS_GENERATION_CHANGED", statisticsGeneration: after.updatedAt }, { status: 409 });
      return Response.json({ ...result, statisticsGeneration: before.updatedAt });
    }`,'fetch-protocol');
assert(s.includes('CURSOR_PINNED_GENERATION_V1'));
await mkdir(D+'/qa',{recursive:true});
await writeFile(D+'/qa/pinned-engine-candidate.js',s);
console.log(JSON.stringify({ok:true,productionWrites:0,protocol:'CURSOR_PINNED_GENERATION_V1'}));

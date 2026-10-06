import assert from 'node:assert/strict';
const {parse}=await import(process.env.B46_ACORN_MODULE || 'acorn');

function nodes(source){
  const result=[];
  function walk(n){
    if(!n||typeof n!=='object')return;
    if(n.type)result.push(n);
    for(const [k,v] of Object.entries(n)){
      if(k==='start'||k==='end')continue;
      if(Array.isArray(v))v.forEach(walk);
      else if(v&&typeof v==='object')walk(v);
    }
  }
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
  return result;
}
function one(list,message){assert.equal(list.length,1,message);return list[0]}
function apply(source,edits){
  edits.sort((a,b)=>b.start-a.start);
  let ceiling=source.length;
  for(const e of edits){
    assert(e.end<=ceiling,'OVERLAPPING_EDITS');
    source=source.slice(0,e.start)+e.text+source.slice(e.end);
    ceiling=e.start;
  }
  parse(source,{ecmaVersion:'latest',sourceType:'module'});
  return source;
}
export function patchEngine(source){
  assert(!source.includes('STATISTICS_SCALE_BACKEND_V1'),'ALREADY_PATCHED');
  assert(source.includes('STAT_LEDGER_PREFIX'),'STAT_LEDGER_PREFIX_MISSING');
  const all=nodes(source);
  const response=one(all.filter(n=>n.type==='MethodDefinition'&&n.key?.name==='statisticsLedgerResponse'),'STATISTICS_RESPONSE_METHOD_SHAPE');
  const route=one(all.filter(n=>n.type==='IfStatement'&&source.slice(n.start,n.end).includes('u.pathname === "/statistics"')&&source.slice(n.start,n.end).includes('statisticsLedgerResponse')),'STATISTICS_ROUTE_SHAPE');

  const methods=`
  async statisticsSummaryResponse() {
    const snapshot = await this.statisticsLedgerResponse(null, true);
    const { rows, returned, nextCursor, hasMore, ...summary } = snapshot;
    return {
      ...summary,
      ok: true,
      rows: [],
      returned: 0,
      nextCursor: null,
      hasMore: false,
      statisticsSummary: "STATISTICS_SCALE_BACKEND_V1"
    };
  }

  async statisticsRowsResponse(cursor = null, limit = 100) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const found = await this.ctx.storage.list({
      prefix: STAT_LEDGER_PREFIX,
      reverse: true,
      limit: safeLimit + 1,
      ...(cursor ? { end: cursor } : {})
    });
    const entries = [...found.entries()];
    const more = entries.length > safeLimit;
    const included = more ? entries.slice(0, safeLimit) : entries;

    // Preserve the exact presentation normalization used by /statistics.
    const board = await this.ctx.storage.get("board").catch(() => null);
    const fetchedAt = Number(board?.hubFetchedAt);
    const ageMs = Date.now() - fetchedAt;
    const fresh = board?.ok === true && board?.stale === false &&
      Number.isFinite(fetchedAt) && fetchedAt > 0 && ageMs >= 0 && ageMs <= 120000;
    const liveFixtureIds = new Set();
    if (fresh && Array.isArray(board.fixtures)) {
      for (const fixture of board.fixtures) {
        const status = (String(fixture?.status ?? "") + " " + String(fixture?.statusCode ?? "")).toLowerCase();
        const unavailable = /finished|full[_ -]?time|\\bft\\b|ended|\\bfull\\b|cancel|postpon|suspend|abandon|scheduled|not[_ -]?started|unknown/.test(status);
        if (fixture?.boardState === "live" && !unavailable && fixture.fixtureId != null) {
          liveFixtureIds.add(String(fixture.fixtureId));
        }
      }
    }
    const rows = included.map(([, src]) => {
      const r = clone2(src);
      delete r._ledgerMarker;
      if (String(r.status || "").toUpperCase() === "PENDING") {
        r.signalEntryMinute = r.entryMinute ?? r.minute ?? null;
        r.entryMinute = r.mirrorMinute ?? r.entryMinute ?? r.minute ?? null;
        r.finalScore = clone2(r.mirrorScore ?? r.entryScore ?? r.scoreAt);
        const displayStatus = liveFixtureIds.has(String(r.fixtureId)) ? "LIVE" : "PENDING";
        r.result = displayStatus;
        r.displayStatus = displayStatus;
      }
      return r;
    });
    return {
      ok: true,
      rows,
      returned: rows.length,
      limit: safeLimit,
      nextCursor: more ? included[included.length - 1][0] : null,
      hasMore: more,
      statisticsRows: "STATISTICS_SCALE_BACKEND_V1"
    };
  }

`;

  const enhancedRoute=`if (u.pathname === "/statistics" && request.method === "GET") {
      const view = u.searchParams.get("view");
      const cursor = u.searchParams.get("cursor");
      if (cursor !== null && (!cursor.startsWith(STAT_LEDGER_PREFIX) || cursor.length > 1024))
        return Response.json({ ok: false, error: "INVALID_STATISTICS_CURSOR" }, { status: 400 });

      if (view === "summary") {
        await this.scanIfDue();
        await this.syncStatisticsLedger();
        return Response.json(await this.statisticsSummaryResponse());
      }

      if (view === "rows") {
        const rawLimit = u.searchParams.get("limit");
        const limit = rawLimit === null ? 100 : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200)
          return Response.json({ ok: false, error: "INVALID_STATISTICS_LIMIT" }, { status: 400 });
        if (!cursor) {
          await this.scanIfDue();
          await this.syncStatisticsLedger();
        }
        return Response.json(await this.statisticsRowsResponse(cursor, limit));
      }

      if (!cursor) { await this.scanIfDue(); await this.syncStatisticsLedger(); }
      return Response.json(await this.statisticsLedgerResponse(cursor, u.searchParams.get("paged") === "1" || cursor !== null));
    }`;

  return apply(source,[
    {start:response.start,end:response.start,text:methods},
    {start:route.start,end:route.end,text:enhancedRoute}
  ]);
}
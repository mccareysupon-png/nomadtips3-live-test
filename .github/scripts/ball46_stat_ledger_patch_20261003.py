from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patcher INPUT OUTPUT')

src = Path(sys.argv[1])
out = Path(sys.argv[2])
s = src.read_text()
start = 'var Nomad343Engine2 = class extends Nomad343Engine {'
end = '};\nfunction stub(env) {'
a = s.find(start)
b = s.find(end, a)
if a < 0 or b < 0:
    raise SystemExit('BRIDGE_CLASS_ANCHOR_MISSING')

new = r'''var STAT_LEDGER_PREFIX = "stat:v1:";
var STAT_LEDGER_VERSION = "signal-ledger-v1";
var Nomad343Engine2 = class extends Nomad343Engine {
  static {
    __name(this, "Nomad343Engine");
  }
  async writeLedgerBatch(entries) {
    for (let i = 0; i < entries.length; i += 64) {
      const batch = Object.fromEntries(entries.slice(i, i + 64));
      if (Object.keys(batch).length) await this.ctx.storage.put(batch);
    }
  }
  async syncStatisticsLedger(finalFixture = null) {
    const signals = await this.ctx.storage.get("signals") || [];
    const board = await this.ctx.storage.get("board") || { fixtures: [] };
    const fixtureMap = new Map((board.fixtures || []).map((f) => [String(f?.fixtureId ?? f?.id ?? ""), f]));
    if (finalFixture?.fixtureId) fixtureMap.set(String(finalFixture.fixtureId), finalFixture);
    const writes = [];
    let workingChanged = false;
    const at = now2();
    for (const sig of signals) {
      if (!sig?.id) continue;
      const f = fixtureMap.get(String(sig.fixtureId));
      const row = clone2(sig);
      if (f) {
        const minute = num3(f?.minute);
        if (minute !== null) row.currentMinute = minute;
        if (f?.goals != null) row.currentScore = clone2(f.goals);
        if (f?.corners != null) row.currentCorners = clone2(f.corners);
        if (f?.cards != null) row.currentCards = clone2(f.cards);
        row.liveStatus = f?.boardState ?? f?.status ?? f?.statusCode ?? row.liveStatus ?? null;
        row.lastLiveAt = at;
      } else if (row.status === "SETTLED") {
        row.currentScore = clone2(row.finalScore ?? row.currentScore ?? row.scoreAt ?? row.entryScore);
        row.currentCorners = clone2(row.finalCorners ?? row.currentCorners ?? row.entryCorners);
        row.currentCards = clone2(row.finalCards ?? row.currentCards ?? row.entryCards);
        row.liveStatus = "finished";
      } else {
        row.currentMinute = row.currentMinute ?? row.minute ?? row.entryMinute ?? null;
        row.currentScore = clone2(row.currentScore ?? row.scoreAt ?? row.entryScore);
        row.currentCorners = clone2(row.currentCorners ?? row.entryCorners);
        row.currentCards = clone2(row.currentCards ?? row.entryCards);
        row.liveStatus = row.liveStatus ?? "live";
      }
      const marker = JSON.stringify([row.status,row.result,row.settledAt,row.currentMinute,row.currentScore,row.currentCorners,row.currentCards,row.liveStatus]);
      if (sig._statLedgerMarker !== marker) {
        row.statisticsLedgerVersion = STAT_LEDGER_VERSION;
        delete row._statLedgerMarker;
        writes.push([STAT_LEDGER_PREFIX + String(sig.id), row]);
        sig.currentMinute = row.currentMinute;
        sig.currentScore = clone2(row.currentScore);
        sig.currentCorners = clone2(row.currentCorners);
        sig.currentCards = clone2(row.currentCards);
        sig.liveStatus = row.liveStatus;
        sig.lastLiveAt = row.lastLiveAt ?? sig.lastLiveAt ?? null;
        sig._statLedgerMarker = marker;
        workingChanged = true;
      }
    }
    await this.writeLedgerBatch(writes);
    if (workingChanged) await this.ctx.storage.put("signals", signals.slice(-MAX_SIGNALS2));
    return { ok: true, version: STAT_LEDGER_VERSION, workingSignals: signals.length, writes: writes.length };
  }
  async readStatisticsLedger() {
    const rows = [];
    let start = void 0;
    for (let page = 0; page < 200; page++) {
      const opts = { prefix: STAT_LEDGER_PREFIX, limit: 1000 };
      if (start !== void 0) opts.start = start;
      const found = await this.ctx.storage.list(opts);
      if (!found.size) break;
      let last = null;
      for (const [key, value] of found) {
        last = key;
        if (value && typeof value === "object") rows.push(value);
      }
      if (found.size < 1000 || !last) break;
      start = last + "\u0000";
    }
    return rows;
  }
  async ledgerStatisticsResponse() {
    const all = await this.readStatisticsLedger();
    const core = statsFrom(all);
    const liveRows = all.filter((x) => x?.status === "PENDING").sort((a,b)=>(b?.createdAt||0)-(a?.createdAt||0));
    return { ok:true, version:VERSION, settlementRevision:SETTLEMENT_REVISION, markets:MARKET_RULES, statisticsLedgerVersion:STAT_LEDGER_VERSION, ledgerTotal:all.length, pending:liveRows.length, liveRows, ...core };
  }
  async scan() {
    const meta = await super.scan();
    if (meta?.ok) {
      const ledger = await this.syncStatisticsLedger();
      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, ledgerWrites: ledger.writes };
    }
    return meta;
  }
  async reconcileExternalFinal(request) {
    if (!secureTokenOk(request, this.env)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const fixture = normalizeFinalFixture(body?.fixture ?? body);
    if (!fixture) return Response.json({ ok: false, error: "INVALID_FIXTURE_PAYLOAD" }, { status: 400 });
    if (!isFinished2(fixture) && !isHalfComplete2(fixture)) return Response.json({ ok: true, version: BRIDGE_VERSION, fixtureId: fixture.fixtureId, state: "NOT_FINAL", settled: 0 });
    const signals = await this.ctx.storage.get("signals") || [];
    const changed = [];
    for (const sig of signals) {
      if (sig?.status !== "PENDING" || String(sig?.fixtureId) !== fixture.fixtureId || !periodComplete(sig, fixture)) continue;
      const result = settleMarketSignal(sig, fixture);
      if (!result) continue;
      sig.status = "SETTLED";
      sig.result = result;
      sig.finalScore = clone2(fixture.goals);
      sig.finalCorners = clone2(fixture.corners);
      sig.finalCards = clone2(fixture.cards);
      sig.settledAt = now2();
      sig.settlementError = null;
      sig.settlementSource = "EXTERNAL_FINAL_BRIDGE";
      changed.push({ id: sig.id, market: sig.market, selection: sig.selection, line: sig.line, result: sig.result, finalScore: sig.finalScore, finalCorners: sig.finalCorners });
    }
    if (changed.length) await this.ctx.storage.put("signals", signals.slice(-MAX_SIGNALS2));
    const ledger = await this.syncStatisticsLedger(fixture);
    return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion:STAT_LEDGER_VERSION, fixtureId: fixture.fixtureId, finished: isFinished2(fixture), settled: changed.length, ledgerWrites:ledger.writes, rows: changed });
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === "/reconcile-final" && request.method === "POST") return this.reconcileExternalFinal(request);
    if (u.pathname === "/bridge-health" && request.method === "GET") return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion:STAT_LEDGER_VERSION });
    if (u.pathname === "/ledger-sync" && request.method === "POST") {
      if (!secureTokenOk(request, this.env)) return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
      const sync = await this.syncStatisticsLedger();
      const stats = await this.ledgerStatisticsResponse();
      return Response.json({...sync,total:stats.total,ledgerTotal:stats.ledgerTotal,pending:stats.pending});
    }
    if (u.pathname === "/ledger-health" && request.method === "GET") {
      const stats = await this.ledgerStatisticsResponse();
      return Response.json({ok:true,version:STAT_LEDGER_VERSION,total:stats.total,ledgerTotal:stats.ledgerTotal,pending:stats.pending});
    }
    if (u.pathname === "/statistics" && request.method === "GET") {
      await this.scanIfDue();
      await this.syncStatisticsLedger();
      return Response.json(await this.ledgerStatisticsResponse());
    }
    return super.fetch(request);
  }
'''

s = s[:a] + new + s[b:]
old = '["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health"]'
newpaths = '["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health", "/ledger-sync", "/ledger-health"]'
if s.count(old) != 1:
    raise SystemExit('ROUTER_ALLOWLIST_ANCHOR_COUNT:' + str(s.count(old)))
s = s.replace(old, newpaths, 1)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print('PATCH_OK', len(s))

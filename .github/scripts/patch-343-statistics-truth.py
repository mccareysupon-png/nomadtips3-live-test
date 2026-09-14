from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'MISSING_ANCHOR:{label}')
    return text.replace(old, new, 1)

hub = Path('workers/nomadtips3-5usd-hub-343/src/index-v5.js')
t = hub.read_text()
t = replace_once(t, "const VERSION='nomad343-5usd-hub-v5-bulk-15s';", "const VERSION='nomad343-5usd-hub-v6-settlement-bridge';", 'hub-version')
a = t.index('  async refresh(){')
b = t.index('  async snapshot(){', a)
method = r'''  async refresh(){
    const attempt=now(),oldMeta=await this.meta(),oldRows=await this.readRows(oldMeta),oldState=await this.state();
    await this.ctx.storage.put('state',{...oldState,lastAttemptAt:attempt});
    try{
      const w=bangkokWindow(),include='odds,events,stats',catalog=await this.readCatalog(),catalogAge=catalog.meta?.fetchedAt?Math.max(0,now()-Number(catalog.meta.fetchedAt)):Infinity;
      let catalogRows=catalog.rows,catalogMeta=catalog.meta,todayRequests=0,todayGuard=false,settlementRequests=0,settlementGuard=false;
      const live=await fetchPages(this.env,`status=live&include=${include}`,LIVE_PAGE_SIZE,LIVE_MAX_PAGES),liveRows=live.rows.map(normalize).filter(x=>x.fixtureId),liveIds=new Set(liveRows.map(x=>String(x.fixtureId)));
      let requestCount=live.requests;
      const settlementCandidates=oldRows.filter(x=>['live','settlement_pending'].includes(String(x?.boardState||''))&&!liveIds.has(String(x?.fixtureId||''))),settlementIds=new Set(settlementCandidates.map(x=>String(x.fixtureId)));
      const catalogExpired=!catalogMeta||catalogMeta.mode!=='scheduled'||catalogMeta.windowStart!==w.start||catalogAge>=CATALOG_REFRESH_MS;
      const forceCatalog=Boolean(settlementIds.size&&catalogExpired&&catalogAge>=5*CATALOG_REFRESH_MS);
      let settlementRows=[];
      if(settlementIds.size&&!forceCatalog&&requestCount<MAX_PROVIDER_REQUESTS_PER_REFRESH){
        const starts=settlementCandidates.map(x=>finite(x?.kickoffAt)).filter(x=>x!==null),baseStart=starts.length?Math.min(...starts):now()-6*60*60_000,start=Math.floor((baseStart-60*60_000)/1000),end=Math.floor((now()+2*60*60_000)/1000);
        const done=await fetchPages(this.env,`start_time=${start}&end_time=${end}&status=finished`,100,1);
        settlementRequests=done.requests;settlementGuard=done.guardHit;requestCount+=settlementRequests;
        settlementRows=done.rows.map(normalize).filter(x=>x.fixtureId&&settlementIds.has(String(x.fixtureId))&&x.boardState==='finished');
      }
      if(catalogExpired&&(!settlementIds.size||forceCatalog)){
        const remaining=Math.max(0,MAX_PROVIDER_REQUESTS_PER_REFRESH-requestCount);
        if(remaining>0){
          const today=await fetchPages(this.env,`start_time=${w.start}&end_time=${w.end}&status=scheduled&include=${include}`,TODAY_PAGE_SIZE,Math.min(TODAY_MAX_PAGES,remaining));
          if(!today.guardHit){
            catalogRows=today.rows.map(normalize).filter(x=>x.fixtureId);
            const stored=await this.writeChunkSet('catalog',catalogRows,catalogMeta);
            catalogMeta={...stored,fetchedAt:now(),windowStart:w.start,windowEnd:w.end,mode:'scheduled',requests:today.requests,guardHit:false};
            await this.ctx.storage.put('catalogMeta',catalogMeta);
          }
          todayRequests=today.requests;todayGuard=today.guardHit;requestCount+=today.requests;
        }
      }
      if(requestCount>MAX_PROVIDER_REQUESTS_PER_REFRESH)throw new Error(`provider:REQUEST_BUDGET_${requestCount}`);
      const map=new Map();
      for(const row of catalogRows)if(row.fixtureId)map.set(String(row.fixtureId),row);
      for(const old of oldRows){
        const id=String(old?.fixtureId||'');if(!id)continue;
        if(map.has(id)){
          const terminal=['finished','settlement_pending'].includes(String(old?.boardState||''));
          map.set(id,terminal?merge(map.get(id),old):merge(old,map.get(id)));
        }else if(['finished','settlement_pending'].includes(String(old?.boardState||''))&&(finite(old?.kickoffAt)===null||now()-Number(old.kickoffAt)<6*60*60_000))map.set(id,old);
      }
      for(const n of liveRows)map.set(String(n.fixtureId),merge(map.get(String(n.fixtureId)),n));
      for(const n of settlementRows)map.set(String(n.fixtureId),merge(map.get(String(n.fixtureId)),n));
      const confirmed=new Set(settlementRows.map(x=>String(x.fixtureId)));
      for(const old of settlementCandidates){
        const id=String(old?.fixtureId||'');if(!id||confirmed.has(id))continue;
        map.set(id,{...old,boardState:'settlement_pending',status:'settlement_pending',statusReason:'AWAITING_CONFIRMED_FINISHED_RESULT'});
      }
      const rows=[...map.values()].sort((a,b)=>(a.kickoffAt??0)-(b.kickoffAt??0)),stored=await this.writeChunkSet('snapshot',rows,oldMeta),counts={scheduled:rows.filter(x=>x.boardState==='scheduled').length,live:rows.filter(x=>x.boardState==='live').length,finished:rows.filter(x=>x.boardState==='finished').length,unknown:rows.filter(x=>x.boardState==='unknown').length,settlementPending:rows.filter(x=>x.boardState==='settlement_pending').length};
      const meta={version:VERSION,fetchedAt:now(),...stored,fixtureCount:rows.length,counts,providerRequestCount:requestCount,providerRequestBudget:MAX_PROVIDER_REQUESTS_PER_REFRESH,todayRequests,liveRequests:live.requests,settlementRequests,catalogAgeMs:Math.max(0,now()-Number(catalogMeta?.fetchedAt||now())),catalogRefreshMs:CATALOG_REFRESH_MS,liveRefreshMs:LIVE_REFRESH_MS,guardHit:Boolean(todayGuard||live.guardHit||settlementGuard),include,todayWindow:{start:w.start,end:w.end,timeZone:'Asia/Bangkok'}};
      await this.ctx.storage.put('meta',meta);await this.ctx.storage.put('state',{lastAttemptAt:attempt,lastSuccessAt:meta.fetchedAt,lastError:null});return meta;
    }catch(e){await this.ctx.storage.put('state',{...oldState,lastAttemptAt:attempt,lastError:String(e?.message||e)});if(oldMeta)return oldMeta;throw e}
  }
'''
t = t[:a] + method + t[b:]
t = replace_once(t, 'todayRequests:m.todayRequests,liveRequests:m.liveRequests,', 'todayRequests:m.todayRequests,liveRequests:m.liveRequests,settlementRequests:m.settlementRequests??0,', 'hub-snapshot-settlement-requests')
hub.write_text(t)

eng = Path('workers/nomadtips3-engine-343/src/index.js')
t = eng.read_text()
t = replace_once(t, "const VERSION='nomad343-engine-v3-settlement-safe';", "const VERSION='nomad343-engine-v4-finished-settlement';", 'engine-version')
t = replace_once(t, "const SETTLEMENT_REVISION='bet365-rules-v2';", "const SETTLEMENT_REVISION='bet365-rules-v3-finished-only';", 'settlement-version')
t = replace_once(t, "function periodCompleteForSignal(s,f){const def=MARKET_RULES[s?.market];if(!def)return false;return def.period==='HT'?isHalfComplete(f):isFinished(f)}", "function periodCompleteForSignal(s,f){return Boolean(MARKET_RULES[s?.market])&&isFinished(f)}", 'finished-only-gate')
a = t.index('function storedFixture(s){')
b = t.index('function statsFrom(signals){', a)
helpers = r'''function storedFixture(s){return {goals:s?.finalScore??null,corners:s?.finalCorners??null,cards:s?.finalCards??null}}
function providerFinalFixture(f){return {goals:clone(f?.goals??null),corners:clone(f?.corners??null),cards:clone(f?.cards??null)}}
function reconcileSettledFromProvider(s,f){
  if(s?.status!=='SETTLED'||!isFinished(f))return false;
  const current=storedFixture(s),next=providerFinalFixture(f);
  if(JSON.stringify(current)===JSON.stringify(next))return false;
  const result=settleMarketSignal(s,next);if(!result)return false;
  const previous=s.result;
  s.finalScore=clone(next.goals);s.finalCorners=clone(next.corners);s.finalCards=clone(next.cards);s.finalDataUpdatedAt=now();
  if(result!==previous){s.previousResult=previous;s.result=result;s.reconciledAt=now()}
  s.settlementRevision=SETTLEMENT_REVISION;return true;
}
'''
t = t[:a] + helpers + t[b:]
t = replace_once(t, "if(s.status==='SETTLED'){if(reconcileSettled(s))reconciled++;continue}", "if(s.status==='SETTLED'){const f=fixtureMap.get(String(s.fixtureId));if(f&&isFinished(f)&&reconcileSettledFromProvider(s,f))reconciled++;continue}", 'reconcile-provider-only')
t = replace_once(t, "s.status='SETTLED';s.result=result;s.finalScore=clone(f.goals);s.finalCorners=clone(f.corners);s.finalCards=clone(f.cards);s.settledAt=now();s.settlementError=null;s.settlementRevision=SETTLEMENT_REVISION;", "s.status='SETTLED';s.result=result;s.finalScore=clone(f.goals);s.finalCorners=clone(f.corners);s.finalCards=clone(f.cards);s.settledAt=now();s.finalDataUpdatedAt=s.settledAt;s.settlementError=null;s.settlementRevision=SETTLEMENT_REVISION;", 'settle-final-data')
eng.write_text(t)

html = Path('nomad-live-343/statistics.html')
t = html.read_text()
loss = '<article class="metric"><span>Losses</span><strong data-loss>—</strong><small>Full losses</small></article>'
t = replace_once(t, loss, loss + '<article class="metric"><span>Push</span><strong data-push>—</strong><small>Stake returned</small></article>', 'push-kpi')
t = replace_once(t, '<thead><tr><th>Date &amp; Time</th>', '<thead><tr><th>#</th><th>Date &amp; Time</th>', 'ordinal-head')
t = replace_once(t, 'colspan="11" class="empty">Waiting for Settled Results', 'colspan="12" class="empty">Waiting for Settled Results', 'empty-colspan')
t = replace_once(t, 'statistics.js?v=343-stat-avg-entry-odds-v1', 'statistics.js?v=343-stat-truth-v1', 'statistics-cache-version')
html.write_text(t)

js = Path('nomad-live-343/statistics.js')
t = js.read_text()
t = replace_once(t, "set('[data-loss]',j.loss);", "set('[data-loss]',j.loss);set('[data-push]',j.push);", 'push-render')
t = replace_once(t, 'rows.map(s=>{const league=', 'rows.map((s,rowIndex)=>{const ordinal=rows.length-rowIndex,league=', 'ordinal-map')
t = replace_once(t, 'return`<tr><td>${esc(dt(s.createdAt))}', 'return`<tr><td>${ordinal}</td><td>${esc(dt(s.createdAt))}', 'ordinal-cell')
t = replace_once(t, 'colspan="11" class="empty">ยังไม่มีสัญญาณ', 'colspan="12" class="empty">ยังไม่มีสัญญาณ', 'thai-empty-colspan')
js.write_text(t)

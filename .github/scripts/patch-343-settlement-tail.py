from pathlib import Path

HUB=Path('workers/nomadtips3-5usd-hub-343/src/index-v5.js')
ENGINE=Path('workers/nomadtips3-engine-343/src/index.js')


def once(s, old, new, label):
    n=s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {n}')
    return s.replace(old,new,1)

h=HUB.read_text()
h=once(h,"const VERSION='nomad343-5usd-hub-v5-bulk-15s';","const VERSION='nomad343-5usd-hub-v6-settlement-tail';",'hub version')
h=once(h,"const CATALOG_REFRESH_MS=60_000;","const CATALOG_REFRESH_MS=60_000;\nconst SETTLEMENT_REFRESH_MS=60_000;\nconst SETTLEMENT_WINDOW_MS=3*60*60_000;\nconst SETTLEMENT_PAGE_SIZE=50;\nconst SETTLEMENT_MAX_PAGES=2;",'settlement constants')
h=once(h,"  async readCatalog(){const meta=await this.ctx.storage.get('catalogMeta')||null;return{meta,rows:await this.readChunkSet('catalog',meta)}}","  async readCatalog(){const meta=await this.ctx.storage.get('catalogMeta')||null;return{meta,rows:await this.readChunkSet('catalog',meta)}}\n  async readSettlements(){const meta=await this.ctx.storage.get('settlementMeta')||null;return{meta,rows:await this.readChunkSet('settlement',meta)}}",'read settlements')
h=once(h,"const w=bangkokWindow(),include='odds,events,stats',catalog=await this.readCatalog();let catalogRows=catalog.rows,catalogMeta=catalog.meta,todayRequests=0,todayGuard=false;","const w=bangkokWindow(),include='odds,events,stats',catalog=await this.readCatalog(),settlement=await this.readSettlements();let catalogRows=catalog.rows,catalogMeta=catalog.meta,settlementRows=settlement.rows,settlementMeta=settlement.meta,todayRequests=0,todayGuard=false;",'refresh setup')
old_live="const live=await fetchPages(this.env,`status=live&include=${include}`,LIVE_PAGE_SIZE,LIVE_MAX_PAGES),requestCount=todayRequests+live.requests;if(requestCount>MAX_PROVIDER_REQUESTS_PER_REFRESH)throw new Error(`provider:REQUEST_BUDGET_${requestCount}`);"
new_live="const live=await fetchPages(this.env,`status=live&include=${include}`,LIVE_PAGE_SIZE,LIVE_MAX_PAGES);let settlementRequests=0,settlementGuard=false,settlementLastError=null;const settlementExpired=!settlementMeta||now()-Number(settlementMeta.fetchedAt||0)>=SETTLEMENT_REFRESH_MS,requestBeforeSettlement=todayRequests+live.requests,settlementBudget=Math.max(0,MAX_PROVIDER_REQUESTS_PER_REFRESH-requestBeforeSettlement);if(settlementExpired&&settlementBudget>0){const end=Math.floor(now()/1000),start=Math.floor((now()-SETTLEMENT_WINDOW_MS)/1000),pages=Math.min(SETTLEMENT_MAX_PAGES,settlementBudget);settlementRequests=1;try{const finished=await fetchPages(this.env,`start_time=${start}&end_time=${end}&status=finished&include=events,stats`,SETTLEMENT_PAGE_SIZE,pages);settlementRequests=finished.requests;settlementGuard=finished.guardHit;settlementRows=finished.rows.map(normalize).filter(x=>x.fixtureId&&x.boardState==='finished');const storedSettlement=await this.writeChunkSet('settlement',settlementRows,settlementMeta);settlementMeta={...storedSettlement,fetchedAt:now(),windowStart:start,windowEnd:end,requests:finished.requests,guardHit:finished.guardHit};await this.ctx.storage.put('settlementMeta',settlementMeta)}catch(e){settlementLastError=String(e?.message||e)}}const requestCount=todayRequests+live.requests+settlementRequests;if(requestCount>MAX_PROVIDER_REQUESTS_PER_REFRESH)throw new Error(`provider:REQUEST_BUDGET_${requestCount}`);"
h=once(h,old_live,new_live,'live/settlement budget')
h=once(h,"liveRequests:live.requests,catalogAgeMs:","liveRequests:live.requests,settlementRequests,settlementCount:settlementRows.length,settlementAgeMs:settlementMeta?.fetchedAt?Math.max(0,now()-Number(settlementMeta.fetchedAt)):null,settlementRefreshMs:SETTLEMENT_REFRESH_MS,settlementWindowMs:SETTLEMENT_WINDOW_MS,settlementGuardHit:settlementGuard,settlementLastError,catalogAgeMs:",'settlement telemetry meta')
h=once(h,"const rows=await this.readRows(m),ageMs=Math.max(0,now()-m.fetchedAt);return{ok:true,version:VERSION,provider:'5DollarFootballAPI'","const rows=await this.readRows(m),settlement=await this.readSettlements(),settlementRows=settlement.rows,ageMs=Math.max(0,now()-m.fetchedAt);return{ok:true,version:VERSION,provider:'5DollarFootballAPI'",'snapshot read settlements')
h=once(h,"guardHit:m.guardHit,include:m.include,todayWindow:m.todayWindow,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.lastSuccessAt,lastError:s.lastError,fixtures:rows","guardHit:m.guardHit,include:m.include,todayWindow:m.todayWindow,settlementCount:settlementRows.length,settlementAgeMs:settlement.meta?.fetchedAt?Math.max(0,now()-Number(settlement.meta.fetchedAt)):null,settlementRefreshMs:m.settlementRefreshMs??SETTLEMENT_REFRESH_MS,settlementWindowMs:m.settlementWindowMs??SETTLEMENT_WINDOW_MS,settlementRequests:m.settlementRequests??0,settlementGuardHit:m.settlementGuardHit??false,settlementLastError:m.settlementLastError??null,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.lastSuccessAt,lastError:s.lastError,settlements:settlementRows,fixtures:rows",'snapshot settlement payload')
HUB.write_text(h)

e=ENGINE.read_text()
e=once(e,"const VERSION='nomad343-engine-v4-10book-referee';","const VERSION='nomad343-engine-v5-settlement-tail';",'engine version')
e=once(e,"const fixtureMap=new Map();for(const f of hub.fixtures||[])fixtureMap.set(String(f.fixtureId),f);","const fixtureMap=new Map();for(const f of hub.fixtures||[])fixtureMap.set(String(f.fixtureId),f);for(const f of hub.settlements||[])fixtureMap.set(String(f.fixtureId),f);",'engine fixture map settlement merge')
ENGINE.write_text(e)

print('patched 3.43 settlement tail: HUB recent-finished side channel + Engine settlement merge')

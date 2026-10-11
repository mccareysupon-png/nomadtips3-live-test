const urls=["/api/engine/health","/api/engine/ledger-health","/api/engine/board","/api/engine/signals","/api/full-market/health","/api/engine/statistics?paged=1"];
const restoredAt=Date.parse("2026-10-11T12:51:26.670Z");
for(let n=0;n<2;n++){
  const out={round:n,at:new Date().toISOString()};
  const items=await Promise.all(urls.map(async p=>{
   try{const u="https://www.ball46.com"+p+(p.includes("?")?"&":"?")+"john_goals_qa="+Date.now();const res=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(35000)});const data=await res.json().catch(()=>null);return{path:p,http:res.status,data};}
   catch(err){return{path:p,error:String(err?.message||err)}}
  }));
  for(const item of items){
    const p=item.path, j=item.data||{};
    if(p.includes("engine/health"))out.engine={http:item.http,scanAt:j.finishedAt,lastError:j.lastError,live:j.liveCount,signal:j.signalCount,refereeRequests:j.refereeRequests,refereeQueued:j.refereeQueued,refereeErrors:(j.refereeErrors||[]).reduce((a,x)=>(a[String(x.error||"UNKNOWN")]=(a[String(x.error||"UNKNOWN")]||0)+1,a),{})};
    if(p.includes("ledger-health"))out.ledger={http:item.http,total:j.ledgerTotal,settled:j.settledTotal,pending:j.pending};
    if(p.includes("engine/board")){const fields=["ft_over","ft_under","ht_over","ht_under","ft_ah","ft_1x2","ft_corner_over"];const analysis={};
      for(const f of j.fixtures||[]){for(const m of fields){let key=String(f?.analysis?.[m]?.state||"MISSING");analysis[m]??={};analysis[m][key]=(analysis[m][key]||0)+1;}}
      out.board={http:item.http,hubStale:j.stale,hubAge:j.hubAgeMs,live:j.counts?.live,fixtureCount:j.fixtures?.length,marketStates:analysis};
    }
    if(p.includes("engine/signals")){const all=Array.isArray(j.signals)?j.signals:[];out.signals={http:item.http,visible:all.length,newSinceRestore:all.filter(x=>Number(x.createdAt)>restoredAt).length,
      recent:all.slice().sort((a,b)=>Number(b.createdAt)-Number(a.createdAt)).slice(0,8).map(x=>({market:x.market,source:x.priceSource,reference:x.priceReference,createdAt:x.createdAt}))};}
    if(p.includes("full-market/health"))out.fullMarket={http:item.http,providerStatus:j.providerMeta?.lastStatus,providerRemaining:j.providerMeta?.remaining,blockedUntil:j.blockedUntil,retryAfterSec:j.retryAfterSec};
    if(p.includes("engine/statistics")){const rows=Array.isArray(j.rows)?j.rows:[];out.stats={http:item.http,rows:rows.length,recentGoalsSinceRestore:rows.filter(x=>Number(x.createdAt)>restoredAt&&["ft_over","ft_under","ht_over","ht_under"].includes(x.market)).map(x=>({market:x.market,source:x.priceSource,reference:x.priceReference,createdAt:x.createdAt,status:x.status})).slice(0,12)};}
  }
  console.log("JOHN_GOALS_PRODUCTION_QA",JSON.stringify(out));
  if(n===0)await new Promise(resolve=>setTimeout(resolve,12000));
}
console.log("JOHN_GOALS_PRODUCTION_QA_FINISHED");

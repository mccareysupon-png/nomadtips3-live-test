import {writeFile,mkdir} from 'node:fs/promises';
const paths=['/api/engine/statistics?paged=1','/statistics-next.js?v=343-next-production-v1','/statistics.html'];
const out={at:new Date().toISOString(),paths:[]};
for(const path of paths){
 try{const r=await fetch('https://ball46.com'+path,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)}),t=await r.text();
  const row={path,status:r.status,size:t.length,type:r.headers.get('content-type')};
  if(path.includes('/statistics?')){const j=JSON.parse(t);row.stat={keys:Object.keys(j),total:j.total,ledgerTotal:j.ledgerTotal,pending:j.pending,win:j.win,loss:j.loss,push:j.push,halfWin:j.halfWin,halfLoss:j.halfLoss,winRate:j.winRate,byMarket:j.byMarket,returned:j.returned,hasMore:j.hasMore,rowsLength:j.rows?.length,rowSample:(j.rows||[]).slice(0,3).map(x=>({keys:Object.keys(x),status:x.status,market:x.market,result:x.result,odds:x.odds,fixtureId:x.fixtureId,source:x.source,createdAt:x.createdAt}))};}
  else if(path.endsWith('.html')){row.scriptRefs=[...t.matchAll(/<script[^>]*src=["']([^"']+)/g)].map(m=>m[1]);row.statsHTML=t.slice(t.indexOf('next-page-head'),t.indexOf('next-page-head')+5100);}
  else{row.sources=[...t.matchAll(/\/api\/engine\/statistics|Settled Signal History|No settled results|data-next-|byMarket|winRate|function render|statisticsLedger|paged=1/gi)].slice(0,100).map(m=>({at:m.index,term:m[0],context:t.slice(Math.max(0,m.index-180),m.index+450)}));}
  out.paths.push(row);
 }catch(e){out.paths.push({path,error:String(e.message||e)})}
}
await mkdir('audit',{recursive:true});await writeFile('audit/stats-page-rendering.json',JSON.stringify(out,null,2));console.log('B46_BTT_STATS_RUNTIME='+JSON.stringify(out).slice(0,49000));

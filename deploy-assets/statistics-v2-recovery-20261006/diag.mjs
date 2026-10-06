import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const urls=[
 ['index','https://ball46.com/index.html'],
 ['workspace','https://ball46.com/singlepage-workspace-343.js?v=statistics-no-total-cap-20261005'],
 ['uisync','https://ball46.com/ui-sync-fixes-343-v2.js?v=statistics-no-total-cap-20261005'],
 ['longterm','https://ball46.com/longterm-performance-343.js?v=statistics-no-total-cap-20261005'],
 ['stats','https://ball46.com/api/engine/statistics']
];
const sha=s=>createHash('sha256').update(s).digest('hex');
async function get(url){
 const u=new URL(url);u.searchParams.set('_recover',Date.now()+Math.random());
 const t=Date.now();
 const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
 const b=Buffer.from(await r.arrayBuffer());
 return {status:r.status,ms:Date.now()-t,bytes:b.length,type:r.headers.get('content-type')||'',text:b.toString('utf8'),sha:sha(b)};
}
for(const [name,url] of urls){
 const x=await get(url);
 console.log('FETCH',name,JSON.stringify({status:x.status,ms:x.ms,bytes:x.bytes,type:x.type,sha:x.sha}));
 if(name==='stats'){
  const j=JSON.parse(x.text);
  console.log('STATS',JSON.stringify({ok:j.ok,total:j.total,ledgerTotal:j.ledgerTotal,pending:j.pending,rows:Array.isArray(j.rows)?j.rows.length:null,returned:j.returned,nextCursor:!!j.nextCursor,statisticsPagination:j.statisticsPagination}));
 } else {
  const terms=['data-stat-market','/api/engine/statistics','paged=1','view=summary','nextCursor','workspace-stats-card'];
  for(const term of terms){
   const hits=[];let at=0;
   while((at=x.text.indexOf(term,at))>=0&&hits.length<8){hits.push(at);at+=term.length}
   if(hits.length)console.log('TERM',name,term,JSON.stringify(hits));
  }
  if(name!=='index'){
   for(const needle of ['data-stat-market','/api/engine/statistics']){
    const i=x.text.indexOf(needle);
    if(i>=0)console.log('SNIP',name,needle,JSON.stringify(x.text.slice(Math.max(0,i-1200),i+3200)));
   }
  }
 }
}
const w=await get('https://ball46.com/singlepage-workspace-343.js?v=statistics-no-total-cap-20261005');
for(const needle of ['BALL46_STATISTICS_DATA','function sameSnapshot','async function page','async function loadStatistics','function counts']){
 const i=w.text.indexOf(needle); if(i>=0) console.log('WORKSPACE_DETAIL',needle,JSON.stringify(w.text.slice(Math.max(0,i-1800),i+7000)));
}
console.log('STATISTICS_V2_RECOVERY_DIAG_DONE');

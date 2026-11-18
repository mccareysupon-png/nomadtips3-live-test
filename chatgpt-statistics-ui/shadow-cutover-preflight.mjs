// Production statistics cut-over preflight. GET only. No mutations or credential output.
import {createHmac} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const site='https://www.ball46.com';
const receiver='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev';
const key=createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ball46/receiver/https-audit/v1/20261118').digest('hex');
console.log('::add-mask::'+key);
async function get(label,url,token){
 const start=performance.now();
 const r=await fetch(url,{headers:{accept:'application/json, text/javascript, text/html','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Cutover-QA',...(token?{authorization:'Bearer '+token}:{})},redirect:'follow',signal:AbortSignal.timeout(35000)});
 const ttfbMs=Math.round(performance.now()-start),body=await r.text(),totalMs=Math.round(performance.now()-start);
 return {label,http:r.status,ttfbMs,totalMs,bytes:Buffer.byteLength(body),body};
}
function json(r){try{return JSON.parse(r.body)}catch{return null}}
const metrics=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='body'));
const summarize=d=>d&&Object.fromEntries(['total','ledgerTotal','pending','unresolved','win','loss','halfWin','halfLoss','push','snapshotSavedAt','statisticsSource'].filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
const legacy=await get('legacy_page',site+'/api/engine/statistics?paged=1');
const head=await get('site_fast_head',site+'/b46-fast-v1/head');
const chart=await get('site_fast_chart',site+'/b46-fast-v1/chart');
const receiverPage=await get('receiver_book_page',receiver+'/audit-book-page-v1',key);
const receiverSnapshot=await get('receiver_audit_snapshot',receiver+'/audit-snapshot',key);
const noAuth=await get('receiver_unauthenticated',receiver+'/audit-book-page-v1');
const workspace=await get('workspace_js',site+'/singlepage-workspace-343.js');
const graph=await get('graph_js',site+'/longterm-performance-343.js');
const html=await get('statistics_html',site+'/?view=statistics');
console.log('CUTOVER_API_TIMINGS='+JSON.stringify([legacy,head,chart,receiverPage,receiverSnapshot,noAuth,workspace,graph,html].map(metrics)));
const l=json(legacy),h=json(head),g=json(chart),b=json(receiverPage),s=json(receiverSnapshot);
if(!l?.ok||!Array.isArray(l.rows)||!b?.ok||!Array.isArray(b.rows)||!s?.readOnly)throw Error('BASELINE_READ_UNAVAILABLE');
const fields=rows=>[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();
const legacyFields=fields(l.rows),receiverFields=fields(b.rows);
const source=workspace.body+'\n'+graph.body;
const readFields=['createdAt','settledAt','fixtureId','home','away','homeName','awayName','league','market','line','variant','pick','selection','status','odds','result','bookmaker','score','finalScore','source','id','signal_id'];
const usage=readFields.filter(k=>new RegExp('(?:\\.|\\?\\.)'+k+'\\b').test(source));
const graphContract={headReady:h?.ok===true,chartReady:g?.ok===true,pairedGeneration:h?.snapshotSavedAt===g?.asOf,seriesKeys:Object.keys(g?.series??{}),summaryKeys:Object.keys(g?.summary??{}),headKeys:Object.keys(h??{}),actualGraphRateLast:g?.series?.rate?.at(-1)?.value??null};
console.log('CUTOVER_CONTRACT='+JSON.stringify({legacyHead:summarize(l),fastHead:summarize(h),graphContract,legacyPageFields:legacyFields,receiverPageFields:receiverFields,clientReferencedFields:usage,legacyStatusSample:[...new Set(l.rows.map(r=>r.status))],receiverAggregate:b.aggregate,receiverSnapshotAggregate:s.book?.aggregate,inbox:s.inbox,seed:b.seed,protected:noAuth.http===403,legacyFieldNamesNotOnReceiver:legacyFields.filter(k=>!receiverFields.includes(k)),clientFetchesLegacy:source.includes('/api/engine/statistics'),clientUsesCreatedAt:source.includes('createdAt'),clientUsesFixtureId:source.includes('fixtureId')}));
const reads=[];
for(let i=0;i<3;i++){
 const x=await get('compact_state_in_book_page',receiver+'/audit-book-page-v1',key),y=await get('site_head',site+'/b46-fast-v1/head');
 reads.push(metrics(x),metrics(y));
}
console.log('CUTOVER_REPEAT_TIMINGS='+JSON.stringify(reads));

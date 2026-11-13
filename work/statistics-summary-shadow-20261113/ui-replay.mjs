import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {Script,runInNewContext} from 'node:vm';
import {connectExistingUi} from './ui-patch.mjs';
const D='work/statistics-summary-shadow-20261113',R=D+'/reference/ui-proof/qa/ui-capture',sha=x=>createHash('sha256').update(x).digest('hex');
export async function prepareUiReplay(){
 const capture=JSON.parse(await readFile(R+'/capture.json')),current=JSON.parse(await readFile(D+'/source/active.json')),website=current.workers.find(x=>x.worker==='ball46-production');assert.equal(capture.active,website.active,'CURRENT_WEBSITE_DRIFT');assert.equal(capture.mainSha,website.sha);
 const input=JSON.parse(await readFile(D+'/reference/ui-proof/qa/verified-full-ledger.json')),audit=JSON.parse(await readFile(D+'/reference/ui-proof/qa/live-ledger.json'));assert(audit.ok);assert.equal(input.rows.length,audit.rows);assert.equal(audit.engineVersion,current.workers.find(x=>x.worker==='nomadtips3-engine-343').active);
 const resources=new Map();
 for(const f of capture.files){const body=await readFile(R+'/files/'+f.file);assert.equal(sha(body),f.sha,'CAPTURE_CORRUPT');resources.set(new URL(f.path,'https://test.invalid').pathname,{...f,body});}
 const originalHtml=await readFile(R+'/index.html','utf8');assert.equal(sha(originalHtml),capture.htmlSha);
 const get=name=>{const f=resources.get(name);assert(f,'MISSING_'+name);return f.body.toString();};
 const workspace=get('/singlepage-workspace-343.js'),dashboard=get('/dashboard-v2-stage3-featured-facts-20261013a.js'),sync=get('/ui-sync-fixes-343-v2.js');
 const patched=connectExistingUi({html:originalHtml,workspace,dashboard,sync});for(const js of [patched.workspace,patched.dashboard,patched.sync])new Script(js);
 for(const m of patched.html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi))if(!m[1].includes('ld+json')&&m[2].trim())new Script(m[2]);
 const registryContext={window:{}};runInNewContext(get('/market-registry-343.js'),registryContext);const registry=registryContext.window.BALL46_MARKET_REGISTRY;
 const settled=input.rows.filter(r=>String(r.status||'').toUpperCase()==='SETTLED'&&['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(r.result));assert.equal(settled.length,input.meta.settledTotal);
 const marketCounts={all:input.rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};for(const row of input.rows)marketCounts[registry.familyOf(row)]++;
 const dailyScript=[...originalHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].map(x=>x[2]).find(x=>x.includes("const CACHE_KEY='b46:daily-performance:shared:v1'"));assert(dailyScript,'DAILY_SOURCE_DRIFT');
 const fnStart=dailyScript.indexOf('function parts('),fnEnd=dailyScript.indexOf('function dateLabel(');assert(fnStart>0&&fnEnd>fnStart);
 const helper="const TZ='Europe/London',CUT=6;const sharedFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});"+dailyScript.slice(fnStart,fnEnd)+';return {aggregate,rate,avgOdds};';
 class RecordedDate extends Date{static now(){return input.asOf;}}
 const formulas=new Function('Date',helper)(RecordedDate),daily=formulas.aggregate(input.rows);
 const dates=settled.map(r=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(r.settledAt??r.createdAt)))).sort();const settledDays=dates.length?Math.max(1,Math.round((Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000)+1):null;
 const recentSettled=settled.slice().sort((a,b)=>Number(b.settledAt??b.createdAt)-Number(a.settledAt??a.createdAt)).slice(0,4).map(r=>Object.fromEntries(['id','status','result','settledAt','createdAt','fixtureId','home','away','league','finalScore','market','marketLabel','selection','line','selectionLine','odds'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])));
 const summaryMarkets=Object.fromEntries(Object.keys(input.meta.byMarket).map(key=>[key,{kind:registry.definitions[key]?.kind,label:registry.definitions[key]?.label}]));
 const summary={ok:true,mode:'TEST_PREVIEW',stale:true,asOf:input.asOf,ledgerTotal:input.meta.ledgerTotal,total:input.meta.settledTotal,byMarket:input.meta.byMarket,markets:summaryMarkets,marketCounts,daily,settledDays,recentSettled};
 assert(Buffer.byteLength(JSON.stringify(summary))<24000,'SUMMARY_NOT_SMALL');
 const boundary={ok:true,active:capture.active,mainSha:capture.mainSha,ledgerRows:input.rows.length,summaryBytes:Buffer.byteLength(JSON.stringify(summary)),changes:patched.changes,patchedAssets:['/singlepage-workspace-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js','/ui-sync-fixes-343-v2.js'],unchangedAssets:capture.files.length-3,cssUnchanged:true,liveScorePollingUnchanged:true,engineSignalCodeUnchanged:true,mode:'TEST_REPLAY_ONLY; no Production route or summary-writer activation'};
 await mkdir(D+'/qa/ui',{recursive:true});await writeFile(D+'/qa/ui/boundary.json',JSON.stringify(boundary,null,2));await writeFile(D+'/qa/ui/summary.json',JSON.stringify(summary));
 await writeFile(D+'/qa/ui/workspace.js',patched.workspace);await writeFile(D+'/qa/ui/dashboard.js',patched.dashboard);await writeFile(D+'/qa/ui/sync.js',patched.sync);await writeFile(D+'/qa/ui/index.html',patched.html);
 return {capture,resources,input,settled,originalHtml,patched,summary,boundary,formulas,registry};
}
export async function startUiReplay(prepared,{candidate=true}={}){
 const {capture,resources,input,settled,originalHtml,patched,summary,registry}=prepared,requests=[],errors=[],staticReads=[];let origin='',failSummary=false,delayPages=0;
 const fixtureMap=new Map();for(const r of input.rows){if(!r.fixtureId||fixtureMap.has(String(r.fixtureId)))continue;fixtureMap.set(String(r.fixtureId),{fixtureId:String(r.fixtureId),league:r.league,home:r.home,away:r.away,status:r.mirrorStatus||'unknown',boardState:r.mirrorStatus||'unknown',goals:r.mirrorScore??r.finalScore??r.entryScore,minute:r.mirrorMinute??r.entryMinute,corners:r.mirrorCorners??r.finalCorners??r.entryCorners,cards:r.mirrorCards??r.finalCards??r.entryCards,recordedAt:r.mirrorUpdatedAt??r.createdAt});if(fixtureMap.size>=100)break;}
 const board={ok:true,version:'RECORDED_UI_REPLAY',fixtures:[...fixtureMap.values()],stale:true,hubFetchedAt:input.asOf,fetchedAt:input.asOf,cacheOnly:true,externalRequestsAdded:0};
 const meta={ok:true,preview:true,version:'recorded-engine-ledger',statisticsPagination:'CURSOR_NO_TOTAL_CAP_V1',ledgerTotal:input.meta.ledgerTotal,total:input.meta.settledTotal,pending:input.meta.pending,unresolved:input.meta.unresolved,win:input.meta.win,loss:input.meta.loss,push:input.meta.push,halfWin:input.meta.halfWin,halfLoss:input.meta.halfLoss,byMarket:input.meta.byMarket,ledgerUpdatedAt:input.asOf};
 const rewrite=s=>s.replaceAll('https://ball46.com',origin).replaceAll(capture.origin,origin);
 const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(u.pathname.startsWith('/api/')){
   const row={path:u.pathname,query:u.search,at:Date.now()};requests.push(row);let data;
   if(u.pathname==='/api/statistics/summary'){if(failSummary){res.writeHead(503,{'content-type':'application/json'});return res.end('{"ok":false,"error":"TEST_FAILURE"}');}data=summary;}
   else if(u.pathname==='/api/engine/statistics'){
    if(delayPages)await new Promise(r=>setTimeout(r,delayPages));const cursor=u.searchParams.get('cursor'),paged=u.searchParams.get('paged')==='1'||cursor!==null;const offset=cursor?Number(cursor.replace('replay:','')):0;assert(Number.isSafeInteger(offset)&&offset>=0);const rows=paged?input.rows.slice(offset,offset+500):input.rows;data={...meta,rows,returned:rows.length,nextCursor:paged&&offset+500<input.rows.length?'replay:'+(offset+500):null,hasMore:paged&&offset+500<input.rows.length};row.returned=rows.length;
   }else if(['/api/engine/board','/api/hub/snapshot'].includes(u.pathname))data=board;
   else if(u.pathname==='/api/engine/signals')data={ok:true,signals:input.rows.filter(r=>r.status==='PENDING').slice(0,30),mirror:{activeMatches:0},externalRequestsAdded:0};
   else if(u.pathname==='/api/engine/registry')data={ok:true,markets:registry.definitions,marketKeys:Object.keys(registry.definitions)};
   else data={ok:true,rows:[],fixtures:[],events:[],pressure:[],markets:summary.markets,externalRequestsAdded:0,mode:'UNRELATED_REPLAY_ONLY'};
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(data));
  }
  if(u.pathname==='/'||u.pathname==='/index.html'){
   const html=rewrite(candidate?patched.html:originalHtml).replace('</body>','<aside style="position:fixed;bottom:5px;right:6px;z-index:2147483647;background:#15452f;color:white;padding:5px 8px;font:10px system-ui;pointer-events:none">TEST SNAPSHOT · Production unchanged</aside></body>');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html);
  }
  const f=resources.get(u.pathname);if(f){let body=f.body;if(candidate){if(u.pathname==='/singlepage-workspace-343.js')body=patched.workspace;if(u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js')body=patched.dashboard;if(u.pathname==='/ui-sync-fixes-343-v2.js')body=patched.sync;}if(/javascript|css/.test(f.type))body=rewrite(body.toString());res.writeHead(200,{'content-type':f.type,'cache-control':'no-store'});return res.end(body);}
  if(/^\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g|svg|avif|ico|woff2?|ttf)$/.test(u.pathname)&&!u.pathname.includes('..')){
   const r=await fetch(new URL(u.pathname+u.search,capture.origin),{redirect:'error',signal:AbortSignal.timeout(10000)});staticReads.push({path:u.pathname,status:r.status});if(r.ok){const body=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'application/octet-stream';resources.set(u.pathname,{body,type});res.writeHead(200,{'content-type':type,'cache-control':'no-store'});return res.end(body);}
  }
  errors.push({path:u.pathname,status:404});res.writeHead(404);res.end('Not captured; external network disabled');
 }catch(e){errors.push({error:e.message,path:req.url});res.writeHead(500,{'content-type':'text/plain'});res.end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 return {origin,requests,errors,staticReads,setSummaryFailure:value=>{failSummary=value;},setPageDelay:ms=>{delayPages=ms;},close:()=>new Promise(r=>server.close(r)),fixtureMap,board};
}

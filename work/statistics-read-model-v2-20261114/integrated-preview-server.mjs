// Local Statistics UI preview on captured Active assets. No POST proxy, deployment,
// provider request, fake success for other APIs, or Production mutation.
import {fileURLToPath} from 'node:url';
import {buildCurrentFormulas} from './build-current-formulas.mjs';
import {patchHomepageStatistics,patchScorebarStatistics} from './homepage-statistics-adapter.mjs';
import {createServer} from 'node:http';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {PersistedReadStore,projectLedgerRow} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
import {ContentPublisher} from './content-publisher.mjs';
import {patchActualStatistics,patchActualPerformance} from './native-stage-ui.mjs';
export async function startPreview({port=8830,mode='candidate'}={}){
const base=new URL('./qa/',import.meta.url),origin='https://ball46-production.mccarey-supon.workers.dev',cache=new Map(),requests=[];
const input=JSON.parse(await readFile(new URL('live-ledger.json',base),'utf8'));if(!input.metadataStable)throw Error('UNVERIFIED_CAPTURE');
const reg={window:{}};vm.runInNewContext(await readFile(new URL('live-base/registry.js',base),'utf8'),reg);
await buildCurrentFormulas();const {formulas}=await import('./qa/current-formulas.mjs');
const store=new PersistedReadStore(new TestDurableStorage()),publisher=new ContentPublisher(store,{registry:reg.window.BALL46_MARKET_REGISTRY,formulas,clock:()=>Date.parse(input.ended)});
if(mode!=='baseline')await publisher.ingest(input.rows.map(projectLedgerRow),input.first);
const originalHtml=await readFile(new URL('live-base/index.html',base),'utf8');
const html=(mode==='baseline'?originalHtml:patchHomepageStatistics(originalHtml)).replace('</head>','<meta name="robots" content="noindex,nofollow"><style>body::after{content:"LOCAL STATISTICS TEST · VERIFIED SNAPSHOT '+input.ended+'";position:fixed;bottom:0;right:0;z-index:2147483647;background:#163d2a;color:#fff;font:10px system-ui;padding:4px;pointer-events:none}</style></head>');
const rawWorkspace=await readFile(new URL('live-base/workspace.js',base),'utf8'),rawPerformance=await readFile(new URL('live-base/performance.js',base),'utf8'),rawScorebar=await readFile(new URL('live-base/scorebar.js',base),'utf8');
const workspace=mode==='baseline'?rawWorkspace:patchActualStatistics(rawWorkspace),performance=mode==='baseline'?rawPerformance:patchActualPerformance(rawPerformance),scorebar=mode==='baseline'?rawScorebar:patchScorebarStatistics(rawScorebar);
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),send=(status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(body):body)};
 requests.push({path:u.pathname,at:Date.now()});
 try{
  if(req.method!=='GET')return send(405,{error:'READ_ONLY_LOCAL_PREVIEW'});
  if(u.pathname==='/__qa/mobile')return send(200,'<!doctype html><title>Statistics mobile viewport test</title><style>body{margin:0;background:#87938c}iframe{display:block;border:0;width:390px;height:844px}</style><iframe title="Statistics mobile 390px" src="/?view=statistics"></iframe>','text/html');
  if(u.pathname==='/__qa/requests')return send(200,{requests,providerRequests:0,productionWrites:0});
  if(u.pathname==='/api/engine/statistics'&&mode==='baseline')return send(200,{...input.first,rows:input.rows,nextCursor:null,hasMore:false});
  if(u.pathname==='/api/hub/snapshot')return send(200,JSON.parse(await readFile(new URL('live-base/hub.json',base),'utf8')));
  if(u.pathname==='/api/engine/signals')return send(200,JSON.parse(await readFile(new URL('live-base/signals.json',base),'utf8')));
  if(u.pathname==='/api/statistics/fast-summary'){const s=await store.summary();return send(s.ok?200:503,s)}
  if(u.pathname==='/api/statistics/fast-view'){const q=Object.fromEntries(u.searchParams);const s=await store.view({...q,page:Number(q.page||1),limit:50,rangeDays:q.rangeDays==='all'?'all':Number(q.rangeDays||7)});return send(s.status||200,s)}
  if(u.pathname==='/'||u.pathname==='/index.html')return send(200,html,'text/html; charset=utf-8');
  if(u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js')return send(200,scorebar,'text/javascript');
  if(u.pathname==='/singlepage-workspace-343.js')return send(200,workspace,'text/javascript');
  if(u.pathname==='/longterm-performance-343.js')return send(200,performance,'text/javascript');
  // Board/health are reads of existing cached website data; all other APIs fail
  // explicitly instead of disguising missing integrations with empty success.
  if(u.pathname.startsWith('/api/')&&!['/api/engine/board','/api/engine/health','/api/hub/snapshot','/api/engine/signals','/api/prediction-vote'].includes(u.pathname))return send(503,{error:'LOCAL_PREVIEW_API_NOT_CONNECTED',path:u.pathname});
  const key=u.pathname+u.search,ttl=u.pathname.startsWith('/api/')?5000:3600000,old=cache.get(key);
  if(!old||Date.now()-old.at>ttl){const r=await fetch(origin+key,{signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());cache.set(key,{at:Date.now(),status:r.status,type:r.headers.get('content-type')||'application/octet-stream',body:b})}
  const value=cache.get(key);res.writeHead(value.status,{'content-type':value.type,'cache-control':'no-store'});res.end(value.body);
 }catch(e){return send(503,{error:String(e.message||e)})}
});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
return {origin:'http://127.0.0.1:'+server.address().port,requests,input,close:()=>new Promise(r=>{server.close(r);server.closeAllConnections()})};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const preview=await startPreview();console.log('LOCAL_PREVIEW '+preview.origin+'/?view=statistics')}

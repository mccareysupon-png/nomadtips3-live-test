import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const {parse}=await import(pathToFileURL(process.env.ACORN_ENTRY).href);
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const prod='ball46-production', origin='https://ball46.com', direct='https://ball46-production.mccarey-supon.workers.dev';
const target='__B46_EVENTFLOW_SIGNAL_JS_20261002__';
const oldCache='b46-mobile-bars-fresh-20261112',newCache='b46-eventflow-same-minute-20261118';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync('qa-output',{recursive:true});
const report={scope:'Event Flow signal identity and card placement only',result:'INITIAL',run:process.env.GITHUB_RUN_ID};
const save=()=>fs.writeFileSync('qa-output/production-report.json',JSON.stringify(report,null,2));
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result;
}
async function active(){
 const r=await api('/scripts/'+prod+'/deployments?per_page=1');
 const v=r.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id;
}
async function version(id){const v=await api('/workers/'+prod+'/versions/'+id+'?include=modules');assert(v.main_module&&v.modules?.length,'VERSION_MODULES_MISSING');return v}
async function schedules(){const r=await api('/scripts/'+prod+'/schedules');const e=Array.isArray(r)?r:r.schedules;assert(Array.isArray(e),'SCHEDULES_MISSING');return e.map(x=>x.cron).sort()}
async function pub(path,base=origin){
 const u=new URL(path,base);u.searchParams.set('b46QA',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
 assert(r.ok,'PUBLIC_HTTP '+u.pathname+' '+r.status);return Buffer.from(await r.arrayBuffer());
}
function literals(s){
 const m=new Map();
 const walk=n=>{if(!n||typeof n!=='object')return;
 if(n.type==='VariableDeclarator'&&n.id?.type==='Identifier'&&n.id.name.startsWith('__B46_')&&n.init?.type==='Literal'&&typeof n.init.value==='string'){assert(!m.has(n.id.name),'DUP_LITERAL '+n.id.name);m.set(n.id.name,{start:n.init.start,end:n.init.end,value:n.init.value});}
 for(const [k,v] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}
 };walk(parse(s,{ecmaVersion:'latest',sourceType:'module'}));return m;
}
function manifest(v){return v.modules.map(m=>({name:m.name,hash:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name))}
async function backend(){
 const out={};
 for(const [key,path] of [['engine','/api/engine/health'],['market','/api/full-market/health'],['board','/api/engine/board'],['signals','/api/engine/signals'],['stats','/api/engine/statistics']]){
  const j=JSON.parse(await pub(path));
  if(key==='signals')assert(Array.isArray(j.signals),'SIGNALS_BAD');else assert(j.ok===true,'BACKEND_BAD '+key);
  if(key==='board')assert(Array.isArray(j.fixtures),'BOARD_BAD');
  if(key==='stats')assert(Array.isArray(j.rows),'STATS_BAD');
  out[key]={ok:true,...(Array.isArray(j.signals)?{count:j.signals.length}:{}),...(Array.isArray(j.fixtures)?{count:j.fixtures.length}:{}),...(Array.isArray(j.rows)?{count:j.rows.length}:{})};
 }return out;
}
async function activate(id,message){await api('/scripts/'+prod+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})})}
async function upload(v,source,ownerModule){
 const md={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,annotations:{'workers/tag':newCache,'workers/message':'Event Flow same-minute cards only'}};
 if(v.assets?.config)md.assets={config:v.assets.config};
 if(v.placement)md.placement=v.placement;
 const f=new FormData();f.append('metadata',new Blob([JSON.stringify(md)],{type:'application/json'}),'metadata.json');
 for(const m of v.modules){const bytes=m.name===ownerModule?Buffer.from(source):Buffer.from(m.content_base64,'base64');const type=m.content_type||(m.name===v.main_module||/\.m?js$/.test(m.name)?'application/javascript+module':m.name.endsWith('.bin')?'application/octet-stream':m.name.endsWith('.txt')?'text/plain':null);assert(type,'UNKNOWN_MODULE_TYPE '+m.name);f.append(m.name,new Blob([bytes],{type}),m.name)}
 const r=await api('/scripts/'+prod+'/versions',{method:'POST',body:f});assert(r.id,'NO_VERSION_ID');return r.id;
}
let base,candidate,activationAttempted=false;
try{
 base=await active();report.rollbackVersion=base;save();console.log('PRODUCTION_ROLLBACK_POINT '+base);
 const current=await version(base), ownerModule='index.js', main=current.modules.find(m=>m.name===ownerModule);assert(main,'EVENTFLOW_OWNER_MODULE_MISSING');
 const source=Buffer.from(main.content_base64,'base64').toString('utf8');
 const before=literals(source),hit=before.get(target);assert(hit,'TARGET_LITERAL_MISSING');
 const publicBefore=await pub('/expanded-match-343.js');
 assert.equal(sha(publicBefore),'eb4937cb82f438840da33ccbd303c42aa4536ade80dfb9634f56a104d7e41076','ACTIVE_PUBLIC_ASSET_DRIFT');
 const test=JSON.parse(fs.readFileSync('qa-output/expanded-match-343.candidate.js.report.json','utf8'));
 const patched=fs.readFileSync('qa-output/expanded-match-343.candidate.js','utf8');
 assert.equal(test.originalHash,sha(publicBefore),'PRODUCTION_SOURCE_DRIFT');
 assert.equal(test.candidateHash,sha(patched),'TEST_CANDIDATE_HASH_MISMATCH');
 assert.equal(test.candidateHash,'42a650f0a8313f1f21114171bef07cbe76831ad08bd35e969ab198ff601f198e','NOT_THE_TESTED_WORKER_CANDIDATE');
 const needle='function signalMarkers(rows,points,current,w,h,pad){';
 const boundary='/* EVENT FLOW Mobile V2:';
 function block(x){const a=x.indexOf(needle),b=x.indexOf(boundary,a);assert(a>=0&&b>a&&x.indexOf(needle,a+1)===-1,'RENDERER_BLOCK_NOT_UNIQUE');return {a,b,text:x.slice(a,b)}}
 const p0=block(publicBefore.toString()),p1=block(patched),embedded=block(hit.value);
 const ast=x=>JSON.stringify(parse(x,{ecmaVersion:'latest'}),(k,v)=>['start','end','raw'].includes(k)?undefined:v);
 assert.equal(ast(embedded.text),ast(p0.text),'EMBEDDED_RENDERER_SEMANTIC_DRIFT');
 const patchedLiteral=hit.value.slice(0,embedded.a)+p1.text+hit.value.slice(embedded.b);
 assert.equal(ast(block(patchedLiteral).text),ast(p1.text));
 console.log('EXACT_RENDERER_OWNER_VERIFIED '+ownerModule+' '+target);
 let out=source.slice(0,hit.start)+JSON.stringify(patchedLiteral)+source.slice(hit.end);
 const originalHtml=(await pub('/')).toString('utf8');
 assert(originalHtml.includes('expanded-match-343.js?v='+oldCache),'LIVE_SCRIPT_CACHE_VERSION_DRIFT');
 assert.equal(out.split(oldCache).length-1,1,'CACHE_BUST_ANCHOR_NOT_UNIQUE');
 out=out.replace(oldCache,newCache);
 const after=literals(out);
 assert.equal(after.size,before.size,'LITERAL_COUNT_CHANGED');
 for(const [k,v] of before){const expected=k===target?patchedLiteral:v.value.replace(oldCache,newCache);assert.equal(after.get(k)?.value,expected,'UNRELATED_LITERAL_CHANGE '+k)}
 const settings=sha(canonical(await api('/scripts/'+prod+'/settings'))),crons=await schedules(),backendBefore=await backend();
 report.baseline={settings,crons,backend:backendBefore,originalHash:test.originalHash,candidateHash:test.candidateHash,modules:manifest(current)};save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');
 candidate=await upload(current,out,ownerModule);report.candidateVersion=candidate;save();console.log('CANDIDATE_UPLOADED '+candidate);
 const cv=await version(candidate);
 assert.equal(canonical(cv.bindings),canonical(current.bindings),'BINDINGS_CHANGED');
 assert.equal(canonical(cv.assets?.config),canonical(current.assets?.config),'ASSETS_CHANGED');
 assert.equal(cv.compatibility_date,current.compatibility_date);
 assert.equal(canonical(cv.compatibility_flags||[]),canonical(current.compatibility_flags||[]));
 assert.equal(cv.main_module,current.main_module);
 const expected=manifest(current).map(m=>m.name===ownerModule?{...m,hash:sha(out)}:m);
 assert.deepEqual(manifest(cv),expected,'UNRELATED_MODULE_CHANGE');
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATION');
 assert.equal(sha(canonical(await api('/scripts/'+prod+'/settings'))),settings,'SETTINGS_MOVED');
 assert.equal(canonical(await schedules()),canonical(crons),'CRONS_MOVED');
 activationAttempted=true;await activate(candidate,'BALL46 same-minute Signal Card fix');
 let good=false;
 for(let i=0;i<45;i++){
  if(await active()===candidate){
   try{
    const results=await Promise.all([pub('/expanded-match-343.js',origin),pub('/expanded-match-343.js',direct),pub('/',origin)]);
    if(results.slice(0,2).every(x=>sha(x)===test.candidateHash)&&results[2].toString().includes('expanded-match-343.js?v='+newCache)){good=true;break}
   }catch{}
  }await delay(1500);
 }
 assert(good,'LIVE_ASSET_OR_CACHE_VERSION_MISMATCH');
 report.liveAssetVerified=true;save();console.log('LIVE_ASSET_HASH_VERIFIED '+test.candidateHash);
 report.backendAfter=await backend();
 assert.equal(sha(canonical(await api('/scripts/'+prod+'/settings'))),settings,'SETTINGS_CHANGED');
 assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:900});await page.setCacheEnabled(false);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const response=await page.goto(origin+'/?b46ProdQA='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});assert(response.ok(),'PRODUCTION_PAGE_HTTP');
  await page.waitForSelector('.match-row[data-match-id]',{timeout:45000});
  const src=await page.evaluate(()=>[...document.scripts].find(s=>s.src.includes('expanded-match-343.js'))?.src||'');
  assert(src.includes(newCache),'BROWSER_STALE_SCRIPT');
  const matches=await page.$$eval('.match-row[data-match-id]',rows=>rows.length);
  assert(matches>0,'NO_MATCH_ROWS');
  await page.screenshot({path:'qa-output/production-page.png'});
  report.browser={pageLoaded:true,matchRows:matches,script:src,pageErrors:errors};
  // The exact current production asset is replayed separately in an isolated browser fixture.
  const pageHtml=(await pub('/')).toString('utf8');fs.writeFileSync('/tmp/b46page.html',pageHtml);
 }finally{await browser.close()}
 const replay=spawnSync(process.execPath,['qa/eventflow-same-minute-20261118/browser.mjs'],{encoding:'utf8',timeout:90000});
 if(replay.stdout)process.stdout.write(replay.stdout);if(replay.stderr)process.stderr.write(replay.stderr);
 assert.equal(replay.status,0,'LIVE_PRESENTATION_REPLAY_FAILED');
 assert.equal(await active(),candidate,'PRODUCTION_MOVED_BEFORE_FINAL');
 report.result='SUCCESS';report.finalVersion=candidate;report.completedAt=new Date().toISOString();save();console.log('PRODUCTION_DEPLOY_PASS '+JSON.stringify({version:candidate,rollback:base,backend:report.backendAfter,browser:report.browser,liveAssetVerified:true}));
}catch(e){
 report.result='FAIL';report.error=String(e);console.error(e.stack);save();
 if(activationAttempted&&base&&candidate){
  try{const now=await active();if(now===candidate){await activate(base,'Rollback Event Flow QA failure');for(let i=0;i<20&&await active()!==base;i++)await delay(1000);assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');report.rollbackConfirmed=true;}else if(now===base){report.rollbackConfirmed=true;}else{report.rollbackSkipped='Production changed independently; refuse overwrite';}}
  catch(rb){report.rollbackError=String(rb);console.error(rb.stack)}
 }
 save();console.log('PRODUCTION_DEPLOY_STOP '+JSON.stringify({error:report.error,base,candidate,rollbackConfirmed:report.rollbackConfirmed,rollbackError:report.rollbackError,rollbackSkipped:report.rollbackSkipped}));process.exitCode=1;
}

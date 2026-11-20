import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {patchHub} from './hub-clone-patch.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const hub='nomadtips3-5usd-hub-343';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const active=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;const v=await cf('/workers/'+hub+'/versions/'+active+'?include=modules');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'b46-hub-shadow-'));const dir=new URL('.',import.meta.url);
try{
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 for(const m of v.modules.filter(m=>m.content_base64&&/\.(m?js)$/.test(m.name))){
  const s=Buffer.from(m.content_base64,'base64').toString();
  assert(!m.name.includes('/')&&!m.name.includes('..'));
  await fs.writeFile(path.join(tmp,m.name),m.name===v.main_module?patchHub(s):s);
 }
 for(const f of ['hub-history-authority.mjs','history-gateway.mjs'])await fs.copyFile(new URL(f,dir),path.join(tmp,f));
 // From this point, the network is entirely disabled; all provider responses
 // originate from the deterministic mock. No API keys or production bindings.
 const realFetch=globalThis.fetch;
 let now=Date.now(),remaining=40,calls=[],mode=200;
 const hdr=()=>({'x-ratelimit-limit':'40','x-ratelimit-remaining':String(remaining),'x-ratelimit-reset':String(Math.floor(now/1000)+30)});
 const transport=async url=>{const u=new URL(url);assert.equal(u.hostname,'api.5dollarfootballapi.com');calls.push(u.pathname+u.search);remaining--;return Response.json({success:1,data:[],pagination:{page:1,has_more:false}},{status:mode,headers:mode===429?{...hdr(),'retry-after':'120'}:hdr()})};
 globalThis.fetch=transport;
 class Storage{
  constructor(){this.data=new Map();this.serial=Promise.resolve()}
  async get(k){return structuredClone(this.data.get(k))}
  async put(k,v){this.data.set(k,structuredClone(v))}
  async transaction(f){const run=this.serial.then(async()=>{const backup=new Map(this.data);try{return await f(this)}catch(e){this.data=backup;throw e}});this.serial=run.catch(()=>{});return run}
 }
 const mod=await import(pathToFileURL(path.join(tmp,v.main_module)).href);
 const {BulkSpeedPolicy,TELEMETRY}=await import(pathToFileURL(path.join(tmp,'speed-policy.mjs')).href);
 const {HistoryAuthority,historyHandler}=await import(pathToFileURL(path.join(tmp,'hub-history-authority.mjs')).href);
 const store=new Storage(),policy=new BulkSpeedPolicy(store,()=>now);
 const shadow={bulkSpeed:policy};const stub={fetch:(url,init)=>mod.__testAttachHistory(shadow,new Request(url,init))};
 const env={HUB:{idFromName:()=>0,get:()=>stub}};
 const live=()=>mod.__testBulk('https://api.5dollarfootballapi.com/v1/fixtures?status=live','test-key',policy,'ALARM_LIVE');
 const rich=()=>mod.__testRich('https://api.5dollarfootballapi.com/v1/fixtures/123/odds','test-key',mod.__testRichRPC(env));
 const req=()=>new Request('https://hub.internal/internal/prematch-history/page',{method:'POST',headers:{'x-test':'ok','content-type':'application/json'},body:JSON.stringify({path:'/v1/leagues/123/fixtures?status=finished&season=26%2F27&per_page=100&page=1'})});
 const a=new HistoryAuthority(policy,{clock:()=>now,enabled:true,coordinated:true});
 const handler=historyHandler({policy,authority:a,authorize:r=>r.headers.get('x-test')==='ok',transport:p=>transport('https://api.5dollarfootballapi.com'+p),clock:()=>now});
 const hist=async()=>await(await handler(req())).json();
 const off=historyHandler({policy,authority:new HistoryAuthority(policy,{clock:()=>now}),authorize:()=>true,transport:()=>{throw Error('DISABLED_TRANSPORT')},clock:()=>now});
 assert.equal((await(await off(req())).json()).reason,'HISTORY_DISABLED');assert.equal(calls.length,0);
 await live();assert.equal(calls.length,1);await rich();assert.equal(calls.length,2);
 let t=await policy.telemetry();assert(t.requests.some(x=>x.kind==='ALARM_LIVE')&&t.requests.some(x=>x.kind==='RICH_ODDS'));assert.equal(t.pending.length,0);assert.equal(t.provider.remaining,38);
 assert.equal((await hist()).status,200);assert.equal(calls.length,3);assert.equal((await hist()).reason,'HISTORY_PACE');assert.equal(calls.length,3);
 now+=61000;remaining=40;await live();let lease=await policy.before('https://api.5dollarfootballapi.com/v1/fixtures','TODAY');
 assert.equal((await hist()).reason,'LIVE_PRIORITY');await policy.failed(lease);
 mode=429;assert.equal((await hist()).status,429);mode=200;assert.equal((await hist()).reason,'PROVIDER_COOLDOWN');const n=calls.length;await assert.rejects(live);assert.equal(calls.length,n);
 // Actual public router still blocks Rich; no network request from viewers.
 const viewer=await mod.default.fetch(new Request('https://example.invalid/rich-odds?fixture_id=123'),{},{});assert.equal(viewer.status,410);assert.equal(calls.length,n);
 // Every successful, mock provider call came through one policy.
 t=await policy.telemetry();assert.equal(t.response429,1);assert.equal(t.pending.length,0);
 globalThis.fetch=realFetch;
 const after=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 console.log('SHARED_HUB_SHADOW',JSON.stringify({active,unchanged:after===active,actualSourcePatched:true,liveRichHistorySameTelemetry:true,shadowCalls:calls.length,realProviderCalls:0,viewerBlocked:true,historyDefaultOff:true,rateLimitShared:true,historyPacing:true,livePriority:true,productionDeployed:false}));
 assert.equal(after,active);
}finally{await fs.rm(tmp,{recursive:true,force:true})}

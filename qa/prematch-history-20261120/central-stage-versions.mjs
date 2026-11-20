import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {patchHub,patchEngine,patchMarket} from './central-transforms.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(35000)});const j=await r.json();if(!r.ok||!j.success)throw Error('CF '+r.status+' '+p+' '+JSON.stringify(j.errors?.map(x=>({code:x.code,message:String(x.message).slice(0,180)}))));return j.result}
const hub='nomadtips3-5usd-hub-343',engine='nomadtips3-engine-343',market='nomadtips3-full-market-343-ball46',names=[hub,engine,market],protectedNames=['ball46-production',...names];
async function active(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions])))}
const before=await active();for(const n of names)assert(before[n].length===1&&before[n][0].percentage===100);
const dir=new URL('.',import.meta.url),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'b46-stage-'));
const keys=Object.fromEntries(['B46_HISTORY_BRIDGE_SECRET','B46_REFEREE_BRIDGE_SECRET','B46_MARKET_BRIDGE_SECRET'].map(n=>[n,crypto.randomBytes(32).toString('hex')]));
const source=async f=>fs.readFile(new URL(f,dir),'utf8');
const newModule=async n=>({name:n,content_type:'application/javascript+module',content_base64:Buffer.from(await source(n)).toString('base64')});
const shared=await Promise.all(['provider-bridge.mjs','history-gateway.mjs'].map(newModule));
const stage=[];
try{
 for(const n of names){const id=before[n][0].version_id,v=await cf('/workers/'+n+'/versions/'+id+'?include=modules'),settings=await cf('/scripts/'+n+'/settings');
  const wanted=n===hub?'const bulkSpeedV3Default=wrapHub(index_viewer_safe_default);':n===engine?'async function fetchVerifiedCornerOnly(':'async function providerRequest(fixtureId, key) {';
  const mods=v.modules.map(m=>({name:m.name,content_type:m.content_type,content_base64:m.content_base64}));const match=mods.filter(m=>Buffer.from(m.content_base64,'base64').toString().includes(wanted));assert.equal(match.length,1,'ACTIVE_SOURCE_ANCHOR_MISSING');
  const old=Buffer.from(match[0].content_base64,'base64').toString();const patched=(n===hub?patchHub:n===engine?patchEngine:patchMarket)(old);
  match[0].content_base64=Buffer.from(patched).toString('base64');mods.push(...shared);if(n===hub)mods.push(await newModule('central-actor.mjs'));
  const folder=path.join(tmp,n);await fs.mkdir(folder);await fs.writeFile(path.join(folder,'package.json'),'{"type":"module"}');
  for(const m of mods){assert(!m.name.includes('/')&&!m.name.includes('..'));await fs.writeFile(path.join(folder,m.name),Buffer.from(m.content_base64,'base64'));if(/\.(m?js)$/.test(m.name)){const c=spawnSync(process.execPath,['--check',path.join(folder,m.name)],{encoding:'utf8'});assert(c.status===0,'SYNTAX_CHECK_FAILED '+m.name)}}
  const oldBindings=v.bindings??settings.bindings;assert(Array.isArray(oldBindings)&&oldBindings.length);
  const bindings=oldBindings.map(b=>({name:b.name,type:'inherit',version_id:id}));
  const secret=(name,text)=>({name,type:'secret_text',text});
  if(n===hub){for(const [k,v] of Object.entries(keys))bindings.push(secret(k,v));}
  if(n===engine)bindings.push(secret('PROVIDER_BRIDGE_SECRET',keys.B46_REFEREE_BRIDGE_SECRET));
  if(n===market){assert(!bindings.some(b=>b.name==='HUB'));bindings.push({name:'HUB',type:'service',service:hub,environment:'production'},secret('PROVIDER_BRIDGE_SECRET',keys.B46_MARKET_BRIDGE_SECRET))}
  const meta={main_module:v.main_module,modules:mods,bindings,compatibility_date:v.compatibility_date,compatibility_flags:settings.compatibility_flags??[],usage_model:v.usage_model??settings.usage_model,annotations:{'workers/message':'BALL46 central migration candidate; history hard OFF; DO NOT DEPLOY until cutover gate passes'}};
  stage.push({name:n,id,meta,oldBindings,folder});
 }
 // Exercise the exact transformed HUB and real transport wrapper entry path without network.
 const h=stage[0],mod=await import(pathToFileURL(path.join(h.folder,h.meta.main_module)).href),policyMod=await import(pathToFileURL(path.join(h.folder,'speed-policy.mjs')).href);
 const owner={FIVEDOLLAR_API_KEY:'test-only-not-real',...keys};let calls=0;
 const net=globalThis.fetch;globalThis.fetch=async(url,opt)=>{assert.equal(new URL(url).hostname,'api.5dollarfootballapi.com');assert.equal(opt.redirect,'manual');assert.equal(opt.headers.authorization,'Bearer test-only-not-real');calls++;return Response.json({success:1,data:[]},{headers:{'x-ratelimit-limit':'40','x-ratelimit-remaining':'39','x-ratelimit-reset':String(Math.floor(Date.now()/1000)+30)}})};
 class Storage{constructor(){this.d=new Map();this.s=Promise.resolve()}async get(k){return structuredClone(this.d.get(k))}async put(k,v){this.d.set(k,structuredClone(v))}async transaction(f){const r=this.s.then(()=>f(this));this.s=r.catch(()=>{});return r}}
 const storage=new Storage(),policy=new policyMod.BulkSpeedPolicy(storage),actor={env:owner,bulkSpeed:policy};
 const {dispatchCentralActor}=await import(pathToFileURL(path.join(h.folder,'central-actor.mjs')).href);
 owner.HUB={idFromName:()=>0,get:()=>({fetch:req=>dispatchCentralActor(actor,req)})};
 const send=(kind,p,key,hostname='hub.internal')=>mod.default.fetch(new Request('https://'+hostname+'/__private/provider/v1',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({kind,path:p})}),owner,{});
 assert.equal((await send('history','/v1/leagues/8273/fixtures?status=finished&season=26%2F27&per_page=100&page=1',keys.B46_HISTORY_BRIDGE_SECRET)).status,200);assert.equal(calls,0);
 assert.equal((await send('referee','/v1/fixtures/123/odds/history?market=corner&bookmaker=bet365&per_page=500',keys.B46_MARKET_BRIDGE_SECRET)).status,404);
 assert.equal((await send('referee','/v1/fixtures/123/odds/history?market=corner&bookmaker=bet365&per_page=500',keys.B46_REFEREE_BRIDGE_SECRET,'public.invalid')).status,404);
 assert.equal((await send('referee','/v1/fixtures/123/odds/history?market=corner&bookmaker=bet365&per_page=500',keys.B46_REFEREE_BRIDGE_SECRET)).status,200);
 assert.equal((await send('fullmarket','/v1/fixtures/123/odds?bookmakers=bet365,pinnacle',keys.B46_MARKET_BRIDGE_SECRET)).status,200);assert.equal(calls,2);
 const t=await policy.telemetry();assert(t.requests.some(x=>x.kind==='REFEREE')&&t.requests.some(x=>x.kind==='FULLMARKET')&&t.pending.length===0);
 globalThis.fetch=net;
 assert.deepEqual(await active(),before,'PRODUCTION_CHANGED_BEFORE_STAGE');console.log('STAGE_SHADOW_PASS',JSON.stringify({mockCalls:calls,realProviderCalls:0,historyHardOff:true,protectedUnchanged:true}));
 // Upload versions ONLY, explicit deploy=false; never create a deployment.
 const evidence=[];
 for(const a of stage){
  const v=await cf('/workers/'+a.name+'/versions?deploy=false',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a.meta)});
  assert(typeof v.id==='string'&&v.id!==a.id);assert.deepEqual(await active(),before,'ACTIVE_DEPLOYMENT_CHANGED');
  console.log('STAGED_UPLOAD_ACCEPTED',JSON.stringify({worker:a.name,version:v.id,rollback:a.id}));
  let check,ready=false,names=[];for(let i=0;i<20;i++){try{
   check=await cf('/workers/'+a.name+'/versions/'+v.id+'?include=modules');
   const returned=check.bindings??[],m=new Map(returned.map(b=>[b.name,b]));names=[...m.keys()];
   const oldOk=a.oldBindings.every(b=>{const q=m.get(b.name);return q?.type===b.type&&['namespace_id','class_name','service','environment','entrypoint','text'].every(k=>b[k]===undefined||q[k]===b[k])});
   const newOk=a.meta.bindings.filter(b=>b.type!=='inherit').every(b=>{const q=m.get(b.name);return q?.type===b.type&&(b.type!=='service'||q.service===b.service)});
   const modulesOk=a.meta.modules.every(b=>check.modules?.some(x=>x.name===b.name&&x.content_base64===b.content_base64));
   if(check.id===v.id&&oldOk&&newOk&&modulesOk&&check.main_module===a.meta.main_module&&check.compatibility_date===a.meta.compatibility_date){ready=true;break}
  }catch(e){if(!String(e.message).startsWith('CF 404 '))throw e}
  await new Promise(r=>setTimeout(r,1500))}
  assert(ready,'STAGED_BINDING_OR_MODULE_NOT_VERIFIED '+a.name+' names='+names.join(','));
  const item={worker:a.name,rollbackVersion:a.id,stagedVersion:v.id,bindingNames:names,active:false};evidence.push(item);console.log('STAGED_VERSION',JSON.stringify(item));
 }
 await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/central-staged-versions.json',JSON.stringify({evidence,activeUnchanged:true,realProviderCalls:0,historyHardOff:true},null,2));
 console.log('CENTRAL_STAGED_READY',JSON.stringify({versions:evidence,activeUnchanged:true,realProviderCalls:0}));
}finally{await fs.rm(tmp,{recursive:true,force:true})}

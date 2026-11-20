import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',archive='ball46-prematch-history-real-test-20261120',legacy='ball46-form-history-v1',test='ball46-last5-archive-compat-test-20261120',hub='nomadtips3-5usd-hub-343',dir='qa/prematch-history-20261120/';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-full-market-343-ball46',hub,legacy];
async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p+' '+JSON.stringify(j.errors?.map(x=>x.code)));return j.result}
async function ver(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function versions(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await ver(n)])))}
const before=await versions(),old=await ver(archive),oldInfo=await cf('/workers/'+archive+'/versions/'+old+'?include=modules');
const priorNamespace=oldInfo.bindings.find(x=>x.name==='HISTORY')?.namespace_id;
assert(priorNamespace&&oldInfo.main_module==='real-worker.mjs');
const sub=(await cf('/subdomain')).subdomain,url='https://'+archive+'.'+sub+'.workers.dev',testUrl='https://'+test+'.'+sub+'.workers.dev',newSecret=crypto.randomBytes(32).toString('hex'),owner=crypto.randomBytes(32).toString('hex');
async function get(u,init={}){const r=await fetch(u,{...init,signal:AbortSignal.timeout(15000)});const j=await r.json();assert(r.ok,'HTTP '+r.status);return j}
const prior=await get(url+'/health');
const upload=async(name,metadata,modules)=>{const f=new FormData();f.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');for(const [n,s] of modules)f.append(n,new Blob([s],{type:'application/javascript+module'}),n);await cf('/scripts/'+name,{method:'PUT',body:f});await cf('/scripts/'+name+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})})};
const load=f=>fs.readFileSync(dir+f,'utf8');
const existing=(await cf('/scripts')).some(x=>x.id===test);assert(!protectedNames.includes(archive)&&!protectedNames.includes(test));
await upload(archive,{main_module:'real-worker.mjs',compatibility_date:'2026-11-19',bindings:[{name:'HISTORY',type:'durable_object_namespace',class_name:'RealHistory'},{name:'SOURCE_HUB',type:'service',service:hub,environment:'production'},{name:'BOOTSTRAP_SECRET',type:'secret_text',text:owner},{name:'LAST5_READ_SECRET',type:'secret_text',text:newSecret}]},['real-worker.mjs','history.mjs','backfill.mjs','john-sync.mjs','audit-history.mjs','last5-archive.mjs'].map(f=>[f,load(f)]));
let active=await ver(archive),info=await cf('/workers/'+archive+'/versions/'+active+'?include=modules');assert.equal(info.bindings.find(x=>x.name==='HISTORY')?.namespace_id,priorNamespace);
let ready=false;for(let i=0;i<20;i++){try{if((await get(url+'/last5-version')).version==='LAST5_ARCHIVE_V1'){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1500))}assert(ready);
let names;for(let i=0;i<8;i++){try{names=await get(url+'/refresh-names',{method:'POST',headers:{authorization:'Bearer '+owner}});break}catch(e){if(!String(e.message).includes('404'))throw e;await new Promise(r=>setTimeout(r,1000))}}assert(names?.ok&&names.externalRequestsAdded===0&&names.teamNames>0);
const after=await get(url+'/health');assert.deepEqual(prior.stored,after.stored);
const testEntry='import legacy,{HistoryGate} from "./last5-legacy-archive.mjs";export {HistoryGate};export default {async fetch(req,env){if(req.headers.get("Authorization")!=="Bearer "+env.TEST_OWNER)return new Response("Not found",{status:404});return legacy.fetch(new Request("https://history.internal"+new URL(req.url).pathname+new URL(req.url).search,req),env)}}';
await upload(test,{main_module:'index.mjs',compatibility_date:'2026-11-19',bindings:[{name:'HISTORY_GATE',type:'durable_object_namespace',class_name:'HistoryGate'},{name:'ARCHIVE',type:'service',service:archive,environment:'production'},{name:'LAST5_READ_SECRET',type:'secret_text',text:newSecret},{name:'TEST_OWNER',type:'secret_text',text:owner}],...(!existing?{migrations:{new_tag:'v1',new_classes:['HistoryGate']}}:{})},[['index.mjs',testEntry],...['last5-legacy-archive.mjs','last5-archive.mjs','history.mjs'].map(f=>[f,load(f)])]);
const auth={authorization:'Bearer '+owner};ready=false;for(let i=0;i<20;i++){try{if((await get(testUrl+'/health',{headers:auth})).mode==='ARCHIVE_READ_ONLY'){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}assert(ready);
const snapshot=await get('https://'+hub+'.'+sub+'.workers.dev/snapshot');assert(snapshot.cacheOnly&&snapshot.externalRequestsAdded===0);
const fixtures=snapshot.fixtures,now=Date.now(),up=fixtures.filter(f=>f.status==='scheduled'&&f.boardState==='scheduled'&&Number(f.kickoffAt)>now&&f.home?.id&&f.away?.id).slice(0,30);assert(up.length);
const finished=fixtures.filter(f=>f.status==='finished'&&f.boardState==='finished'&&f.home?.id&&f.away?.id);assert(finished.length);
const call=async f=>get(testUrl+'/last5?'+new URLSearchParams({fixtureId:String(f.fixtureId),home:String(f.home.id),away:String(f.away.id),cutoff:String(Math.floor(f.kickoffAt))}),{headers:auth});
const collected=[];
for(const f of up){const j=await call(f);assert(j.ok&&String(j.fixtureId)===String(f.fixtureId)&&j.externalRequestsAdded===0);for(const t of [j.home,j.away]){assert(t.verified&&t.rows.length===t.count&&t.count<=5);assert(t.rows.every(r=>r.status==='FT'&&r.opponent.name&&Number.isInteger(r.gf)&&Number.isInteger(r.ga)&&Date.parse(r.kickoffUtc)<f.kickoffAt))}collected.push({fixtureId:String(f.fixtureId),home:j.home.count,away:j.away.count})}
const sample=await call({...finished[0],fixtureId:up[0].fixtureId,kickoffAt:now+1000});assert(sample.home.count+sample.away.count>0,'NO_ACTUAL_FT_SAMPLE');
assert.equal((await fetch(testUrl+'/last5')).status,404);assert.equal((await fetch(url+'/last5?fixtureId=1&home=2&away=3&cutoff='+now)).status,404);
const verified=await versions();assert.deepEqual(verified,before);
const result={archiveVersion:active,archiveRows:after.stored.fixtures,teamNames:names.teamNames,upcomingSample:collected.length,completeBoth:collected.filter(x=>x.home===5&&x.away===5).length,partial:collected.filter(x=>x.home+x.away>0).length,actualSample:{home:sample.home.count,away:sample.away.count},realProviderCalls:0,legacyProductionUnchanged:true,protectedUnchanged:true,scope:'ISOLATED_TEST_SERVICE_ONLY'};
console.log('LAST5_ARCHIVE_REAL_TEST',JSON.stringify(result));
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/last5-archive-real.json',JSON.stringify(result,null,2));

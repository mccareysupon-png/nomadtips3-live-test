import assert from'node:assert/strict';
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const W='ball46-production',EXPECTED='dc158cd1-bf39-4b6a-a4eb-3e3c8b0c2db4',NS='BALL46_PREDICTION_VOTES_V5_20261024';
const base='deploy-assets/prediction-vote-v5-20261024/',out={at:new Date().toISOString(),ok:false,baseVersion:EXPECTED,trafficChanged:false};
await mkdir(base+'audit',{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
async function cf(p,body){
 if(body!==undefined&&!['/storage/kv/namespaces','/workers/scripts/'+W+'/versions'].includes(p))throw Error('UNAUTHORIZED_WRITE_TARGET_'+p);
 const isForm=body instanceof FormData;
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+T,...(body===undefined||isForm?{}:{'content-type':'application/json'})},body:body===undefined?undefined:isForm?body:JSON.stringify(body),signal:AbortSignal.timeout(95000)});
 let j;try{j=await r.json()}catch{throw Error('CLOUDFLARE_BAD_JSON_'+r.status)}
 if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,350));
 return j.result;
}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return{version:d.versions[0].version_id,deployment:d.id};}
try{
 const before=await active();assert.equal(before.version,EXPECTED,'PRODUCTION_CHANGED_ABORT');out.before=before;
 const v=await cf('/workers/workers/'+W+'/versions/'+EXPECTED+'?include=modules');
 const settings=await cf('/workers/scripts/'+W+'/settings');
 assert(v.assets&&v.main_module&&v.modules?.length===15,'PRODUCTION_WORKER_SHAPE_DRIFT');
 const m=v.modules.find(x=>x.name===v.main_module),src=Buffer.from(m.content_base64,'base64').toString();
 assert.equal(src.split('export default {').length,2,'MAIN_EXPORT_DRIFT');
 const stored=await cf('/storage/kv/namespaces?per_page=100');
 let ns=stored.find(x=>x.title===NS);
 if(!ns)ns=await cf('/storage/kv/namespaces',{title:NS});
 assert(ns?.id,'VOTE_KV_CREATION_FAILED');out.kvNamespace=ns.id;
 const originalBindings=v.bindings||[];assert(!originalBindings.some(x=>x.name==='PREDICTION_VOTES_KV'));
 const binding={name:'PREDICTION_VOTES_KV',type:'kv_namespace',namespace_id:ns.id};
 const script=await readFile(base+'build/v5-browser.mjs','utf8');
 const png=await readFile(base+'build/v5-jerseys.mjs','utf8');
 const votes=await readFile(base+'vote-api.mjs','utf8');
 const main=[
 'import {browserScript} from "./b46-v5-browser.mjs";',
 'import {jerseyPng} from "./b46-v5-jerseys.mjs";',
 'import {voteRoute} from "./b46-v5-vote.mjs";',
 src.replace('export default {','const __b46V5Previous = {'),
 '/* BALL46_APPROVED_VOTE_V5: route-local wrapper; engine, fixtures and statistics untouched */',
 'export default {...__b46V5Previous,async fetch(request,env,ctx){',
 ' const p=new URL(request.url).pathname;',
 ' if(request.method==="GET"&&p==="/live-prediction-343.js")return new Response(browserScript,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-cache, must-revalidate","x-ball46-vote-v5":"approved-borderless"}});',
 ' const match=p.match(/^\\/b46-v5\\/jersey-([0-5])\\.png$/);',
 ' if(request.method==="GET"&&match){const b=jerseyPng[Number(match[1])];return new Response(Uint8Array.from(atob(b),c=>c.charCodeAt(0)),{headers:{"content-type":"image/png","cache-control":"public,max-age=31536000,immutable","x-content-type-options":"nosniff"}});}',
 ' if(p==="/api/prediction-vote")return voteRoute(request,env);',
 ' return __b46V5Previous.fetch.call(__b46V5Previous,request,env,ctx);',
 '}};'
 ].join('\n');
 out.originalMainSha=digest(Buffer.from(src));out.patchedMainSha=digest(Buffer.from(main));
 await writeFile(base+'audit/wrapped-main.mjs',main);
 const check=spawnSync('node',['--check',base+'audit/wrapped-main.mjs'],{encoding:'utf8'});
 assert.equal(check.status,0,'WORKER_SYNTAX_'+check.stderr.slice(0,300));
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],
  bindings:[...originalBindings,binding],assets:{config:v.assets.config},keep_assets:true,
  annotations:{'workers/tag':'BALL46_PREDICTION_VOTE_V5_20261024','workers/message':'Approved borderless V5, six original PNGs, dedicated persistent KV votes, no engine/statistics change'}};
 for(const key of['usage_model','logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const module of v.modules)form.set(module.name,new Blob([module.name===v.main_module?main:Buffer.from(module.content_base64,'base64')],{type:module.content_type}),module.name);
 for(const [name,textContent]of[['b46-v5-browser.mjs',script],['b46-v5-jerseys.mjs',png],['b46-v5-vote.mjs',votes]]){
  form.set(name,new Blob([textContent],{type:'application/javascript+module'}),name);
 }
 assert.equal((await active()).version,EXPECTED,'PARALLEL_DEPLOY_ABORT');
 const uploaded=await cf('/workers/scripts/'+W+'/versions',form);out.candidate=uploaded.id;
 const test=await cf('/workers/workers/'+W+'/versions/'+out.candidate+'?include=modules');
 assert.equal(test.annotations?.['workers/tag'],'BALL46_PREDICTION_VOTE_V5_20261024','WRONG_CANDIDATE_TAG');
 assert.equal(test.modules.length,v.modules.length+3,'MODULES_MISSING');
 for(const module of v.modules){const bytes=Buffer.from(test.modules.find(z=>z.name===module.name).content_base64,'base64');
  assert.equal(digest(bytes),module.name===v.main_module?out.patchedMainSha:digest(Buffer.from(module.content_base64,'base64')),'UNRELATED_MODULE_CHANGED_'+module.name);}
 assert(test.bindings?.some(b=>b.name===binding.name&&b.type==='kv_namespace'&&b.namespace_id===ns.id),'KV_BINDING_MISSING');
 for(const b of originalBindings)assert(test.bindings.some(z=>z.name===b.name&&z.type===b.type),'LOST_BINDING_'+b.name);
 out.preview='https://'+out.candidate.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 async function get(path){const r=await fetch(out.preview+path,{signal:AbortSignal.timeout(60000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,body:b,headers:r.headers}}
 const [client,img,poll]=await Promise.all([get('/live-prediction-343.js'),get('/b46-v5/jersey-0.png'),get('/api/prediction-vote?fixtureId=1234567')]);
 assert.equal(client.status,200);assert(client.body.includes(Buffer.from('data-vote')));assert(!client.body.includes(Buffer.from('62,27,39')),'FAKE_VOTES_DETECTED');
 assert.equal(img.status,200);assert.equal(img.body.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(poll.status,200);const tally=JSON.parse(poll.body.toString());assert(tally.ok&&tally.total===0&&tally.counts.every(x=>x===0));
 assert.equal((await active()).version,EXPECTED,'CANDIDATE_CHANGED_LIVE_TRAFFIC');
 out.ok=true;out.clientLength=client.body.length;out.imageBytes=img.body.length;out.kvZeroVotes=true;
 console.log('B46_V5_CANDIDATE_PASS='+JSON.stringify({ok:true,previous:EXPECTED,candidate:out.candidate,preview:out.preview,moduleCount:test.modules.length,clientLength:out.clientLength,jerseyBytes:out.imageBytes,realVotesFromEmptyKV:0,liveTrafficChanged:false}));
}catch(e){out.error=String(e.stack||e);console.error('B46_V5_CANDIDATE_FAIL='+String(e.message||e));process.exitCode=1;}
await writeFile(base+'audit/candidate.json',JSON.stringify(out,null,2));

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {patchWorker,MARK} from './patch.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const worker='ball46-premium-match-colors-test-20261120';
assert(token&&account,'CF_AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-production','ball46-prematch-only-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const report={task:MARK,worker,run:process.env.GITHUB_RUN_ID};
mkdirSync('qa/perf-range-inplace-20261125/audit',{recursive:true});
function save(){writeFileSync('qa/perf-range-inplace-20261125/audit/release.json',JSON.stringify(report,null,2))}
const hash=s=>createHash('sha256').update(s).digest('hex');
async function api(path,method='GET',body){
 const opts={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(75000)};
 if(body){if(body instanceof FormData)opts.body=body;else {opts.headers['content-type']='application/json';opts.body=JSON.stringify(body)}}
 const r=await fetch(root+path,opts),j=await r.json();
 assert(r.ok&&j.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(j.errors||[]).slice(0,250));return j.result;
}
async function active(name){
 const d=await api('/scripts/'+name+'/deployments?per_page=1');
 const v=d.deployments?.[0]?.versions;
 assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_AMBIGUOUS_'+name);
 return v[0].version_id;
}
async function protect(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])))}
let before,target,changed=false;
try{
 before=await active(worker);report.previous=before;
 const frozen=await protect(),v=await api('/workers/'+worker+'/versions/'+before+'?include=modules');
 assert.equal(v.main_module,'worker.js');
 assert.equal(v.modules.length,1,'TEST_MODULE_LAYOUT_DRIFT');
 const src=Buffer.from(v.modules[0].content_base64,'base64').toString(),patched=patchWorker(src);
 assert(patched.client.includes(MARK)&&patched.client.includes("if(!b46UpdatePerformanceOnly())draw();if(range)loadPerformanceGraph(true);return;"));
 assert(patched.client.includes('b46AdaptiveChartDays')&&patched.client.includes('B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125'));
 const settings=await api('/scripts/'+worker+'/settings');
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],
    bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'}))};
 assert.deepEqual(meta.bindings.map(x=>x.name).sort(),['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE']);
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 form.append(v.main_module,new Blob([patched.worker],{type:'application/javascript+module'}),v.main_module);
 report.source={previousSha:hash(src),newSha:hash(patched.worker),delta:patched.worker.length-src.length,clientMarker:MARK,protected:frozen};
 save();
 assert.equal(await active(worker),before,'CONCURRENT_TEST_CHANGE_PRE_UPLOAD');
 target=(await api('/scripts/'+worker+'/versions?bindings_inherit=strict','POST',form)).id;
 assert(target&&target!==before);report.candidate=target;save();
 const next=await api('/workers/'+worker+'/versions/'+target+'?include=modules');
 assert.equal(next.modules.length,1);
 assert.equal(hash(Buffer.from(next.modules[0].content_base64,'base64').toString()),hash(patched.worker),'CANDIDATE_CONTENT_CHANGED');
 assert.equal(await active(worker),before,'CONCURRENT_TEST_CHANGE_PRE_ACTIVATION');
 assert.deepEqual(await protect(),frozen,'OTHER_WORKER_CHANGED');
 await api('/scripts/'+worker+'/deployments','POST',{strategy:'percentage',versions:[{version_id:target,percentage:100}],annotations:{'workers/message':MARK}});
 changed=true;
 for(let i=0;i<10;i++){if(await active(worker)===target)break;await new Promise(r=>setTimeout(r,1200))}
 assert.equal(await active(worker),target,'DEPLOY_NOT_ACTIVE');
 const host='https://'+worker+'.mccarey-supon.workers.dev';
 const js=await fetch(host+'/__b46_prematch_client.js',{signal:AbortSignal.timeout(30000)});
 assert(js.ok&&(await js.text()).includes(MARK),'CLIENT_MARKER_NOT_LIVE');
 assert.deepEqual(await protect(),frozen,'PROTECTED_WORKER_CHANGED_POST_DEPLOY');
 report.result='TEST_ACTIVE_PENDING_BROWSER_QA';save();
 console.log('B46_PERF_INPLACE_TEST_DEPLOYED '+JSON.stringify({previous:before,version:target,url:host+'/?b46pm=ou',modules:1,protectedUnchanged:true,productionWrites:0}));
}catch(error){
 report.error=String(error.stack||error);
 if(changed){try{
   assert.equal(await active(worker),target,'NEWER_TEST_DEPLOY_FOUND_NO_ROLLBACK');
   await api('/scripts/'+worker+'/deployments','POST',{strategy:'percentage',versions:[{version_id:before,percentage:100}],annotations:{'workers/message':'Rollback failed performance no-flicker QA'}});
   report.rollback=before;
 }catch(e){report.rollbackError=String(e)}}
 save();throw error;
}

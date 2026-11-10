import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const D='work/favorites-test-20261110/diagnosis',A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production',BASE='c9e86292-6ed9-4788-98de-1b363f478d74',NEXT='bb843259-ec01-4cd6-a43f-1f1b22c560b4';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED_'+r.status);return j.result}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{version:d.versions[0].version_id,deployment:d.id}}
const out={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,productionWrites:0,explicitProviderRequests:0,samples:[]};
await mkdir(D,{recursive:true});
try{
out.before=await active();assert.equal(out.before.version,BASE,'ACTIVE_VERSION_DRIFT_STOP');
const current=await cf('/workers/workers/'+W+'/versions/'+BASE+'?include=modules'),candidate=await cf('/workers/workers/'+W+'/versions/'+NEXT+'?include=modules');
const main=Buffer.from(current.modules.find(m=>m.name===current.main_module).content_base64,'base64').toString();
const lines=main.split('\n'),i=lines.findIndex(s=>s.includes("console.error('B46_V13_CANDIDATE_ONLY_WORKER_EXCEPTION'"));
out.catchSource=lines.slice(i-5,i+6).join('\n');out.mainSha=sha(main);
out.codeInventory={mainBytes:Buffer.byteLength(main),fetchDefinitions:(main.match(/async fetch\s*\(/g)||[]).length,bodyTextReads:(main.match(/await (?:response|original|res)\.text\(\)/g)||[]).length};
out.unchangedNonMain=current.modules.filter(m=>m.name!==current.main_module).every(m=>candidate.modules.some(n=>n.name===m.name&&n.content_base64===m.content_base64));
out.moduleCounts={current:current.modules.length,candidate:candidate.modules.length};
const sanitize=s=>s.replace(/Bearer\s+\S+/gi,'Bearer [omitted]').replace(/https?:\/\/[^\s)]+/g,'[URL omitted]');
for(const path of['/api/engine/health','/api/hub/health']){
 const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(45000)});const b=await r.text();let j;try{j=JSON.parse(b)}catch{}out.samples.push({path,status:r.status,ok:j?.ok,version:j?.version,error:j?.error,configuredSeconds:j?.bulkSpeedV3?.configuredSeconds});assert(r.ok&&j?.ok!==false,'HEALTH_FAILED_STOP');
}
for(let round=0;round<4;round++){
 for(const host of['https://ball46.com','https://bb843259-ball46-production.mccarey-supon.workers.dev']){
 const t=performance.now();try{const r=await fetch(host+'/api/engine/board',{signal:AbortSignal.timeout(45000)}),body=await r.text();let j;try{j=JSON.parse(body)}catch{}
out.samples.push({round,host,path:'/api/engine/board',status:r.status,ms:Math.round(performance.now()-t),bytes:Buffer.byteLength(body),sha:sha(body),ok:j?.ok,fixtures:j?.fixtures?.length,cacheOnly:j?.cacheOnly,stale:j?.stale,marker:body.includes('B46_V13_CANDIDATE_ONLY_WORKER_EXCEPTION'),cfRay:r.headers.get('cf-ray'),errorBody:r.status>=400?sanitize(body).slice(0,2400):undefined});
 }catch(e){out.samples.push({round,host,error:sanitize(String(e)),ms:Math.round(performance.now()-t)})}}
 if(round<3)await new Promise(r=>setTimeout(r,2500));
}
out.after=await active();assert.deepEqual(out.after,out.before,'CONCURRENT_CHANGE');out.completed=true;
}catch(e){out.completed=false;out.error=String(e.stack);process.exitCode=1}
await writeFile(D+'/report.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));

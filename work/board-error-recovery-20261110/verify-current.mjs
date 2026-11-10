import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {patchMain,before,after} from './patch.mjs';
const A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production',D='work/board-error-recovery-20261110/stage';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method:'GET',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED_'+r.status);return j.result;}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{version:d.versions[0].version_id,deployment:d.id};}
await mkdir(D,{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,at:new Date().toISOString(),productionWrites:0,providerRequests:0,uploadedVersions:0};
try{
 report.active=await active();assert.equal(report.active.version,'c9e86292-6ed9-4788-98de-1b363f478d74','ACTIVE_VERSION_DRIFT_STOP');
 const v=await cf('/workers/workers/'+W+'/versions/'+report.active.version+'?include=modules');
 const m=v.modules.find(x=>x.name===v.main_module),raw=Buffer.from(m.content_base64,'base64'),source=raw.toString();
 assert.equal(sha(raw),'b4d3b6f3f9e4fe00cc64d8a0f41d07746c0e9a9ab95a0f08dc2a2a81205ef626','PRODUCTION_MAIN_DRIFT');
 const next=patchMain(source);assert.equal(next.replace(after,()=>before),source);
 await writeFile(D+'/index.mjs',next);execFileSync(process.execPath,['--check',D+'/index.mjs']);
 report.source={module:v.main_module,before:sha(raw),after:sha(next),exactInverseDiff:true};
 report.unchangedModules=v.modules.filter(x=>x.name!==v.main_module).map(x=>({name:x.name,sha:sha(Buffer.from(x.content_base64,'base64'))}));
 report.boundary={changedFunction:'Website adapter engineBoardResponse only',newModules:0,engineServiceChanged:false,signalLogicChanged:false,settlementLedgerChanged:false,uiChanged:false,favoritesIncluded:false,pollingChanged:false,configurationWrites:0};
 report.activeAfter=await active();assert.deepEqual(report.activeAfter,report.active,'CONCURRENT_PRODUCTION_CHANGE');report.ok=true;
}catch(e){report.ok=false;report.error=String(e.stack);process.exitCode=1;}
await writeFile(D+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

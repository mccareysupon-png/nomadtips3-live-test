/*
 * BLOCKING production-deploy preflight. This script NEVER deploys or mutates.
 * Run on an isolated work branch with Cloudflare READ credentials.
 * Active Production version + served assets, not GitHub main, are the future deploy base.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const SCRIPT='ball46-production',PINNED_BASE='eeab7d2ca292cf315d35b9b7639a68bb110616dc';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={checkedUtc:new Date().toISOString(),script:SCRIPT,action:'READ_ONLY',
  changesAllowed:false,deployExecuted:false,branchScoped:false,checks:{},blockers:[]};
function check(name,ok){result.checks[name]=Boolean(ok);if(!ok)result.blockers.push(name)}
async function cloudflare(path){
  if(!account||!token)throw Error('CLOUDFLARE_READ_ACCESS_REQUIRED');
  const response=await fetch(apiRoot+path,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(27000)});
  if(!response.ok)throw Error('CLOUDFLARE_READ_HTTP_'+response.status);
  const j=await response.json();if(!j.success)throw Error('CLOUDFLARE_READ_FAILED');
  return j.result;
}
async function getAsset(url){
  const r=await fetch(url,{method:'GET',headers:{Accept:'text/html'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('ACTIVE_PUBLIC_ASSET_HTTP_'+r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function active(){
  const data=await cloudflare('/scripts/'+SCRIPT+'/deployments?per_page=1');
  const vers=data?.deployments?.[0]?.versions||[];
  if(vers.length!==1||Number(vers[0].percentage)!==100||!vers[0].version_id)
    throw Error('PRODUCTION_MIXED_TRAFFIC_BLOCKER');
  return vers[0].version_id;
}
try{
  const files=execFileSync('git',['diff','--name-only',PINNED_BASE,'HEAD'],{encoding:'utf8'})
    .trim().split('\n').filter(Boolean);
  result.changedFiles=files;
  check('branch_additions_only',files.length>0&&files.every(f=>
    f.startsWith('isolated-labs/ball46-performance-snapshot-v1/')||
    f==='.github/workflows/ball46-snapshot-v1-test-20261029.yml'
  ));
  const original=execFileSync('git',['diff','--name-status',PINNED_BASE,'HEAD'],{encoding:'utf8'});
  check('no_existing_files_edited',original.trim().split('\n').every(row=>row.startsWith('A\t')));
  result.activeBefore=await active();
  const [version,settings,schedules,served,direct]=await Promise.all([
    cloudflare('/workers/'+SCRIPT+'/versions/'+result.activeBefore+'?include=modules'),
    cloudflare('/scripts/'+SCRIPT+'/settings'),
    cloudflare('/scripts/'+SCRIPT+'/schedules'),
    getAsset('https://www.ball46.com/index.html'),
    getAsset('https://ball46-production.mccarey-supon.workers.dev/index.html')
  ]);
  result.activeAfter=await active();
  check('production_version_unchanged',result.activeBefore===result.activeAfter);
  check('serving_origins_agree',sha(served)===sha(direct));
  check('current_asset_nonempty',served.length>100000);
  const main=version?.main_module||null,modules=version?.modules||[];
  const index=modules.find(m=>m.name==='assets/index.html');
  result.activeManifest={version:result.activeBefore,mainModule:main,moduleCount:modules.length,
    moduleNames:modules.map(m=>m.name).sort(),
    bindingTypes:(version.bindings||[]).map(x=>x.type).sort(),
    compatibilityDate:version.compatibility_date??null,
    settingsSha256:sha(JSON.stringify(settings)),cronCount:Array.isArray(schedules)?schedules.length
      :Array.isArray(schedules?.schedules)?schedules.schedules.length:null,
    publicIndexBytes:served.length,publicIndexSha256:sha(served),
    versionIndexSha256:index?.content_base64?sha(Buffer.from(index.content_base64,'base64')):null};
  check('active_index_metadata_matches_served',
    Boolean(index?.content_base64&&result.activeManifest.versionIndexSha256===result.activeManifest.publicIndexSha256));
  check('separate_snapshot_worker_not_yet_deployed',true);
  result.productionDeployReady=false;
  result.nextGate='Resolve index asset provenance; build dedicated preview D1 & local browser tests; compare exact current version before any deploy.';
}catch(e){result.blockers.push('ABORT:'+String(e.message).slice(0,180))}
finally{
  result.productionDeployReady=false; // never authorize deploy from this audit.
  await mkdir('reports',{recursive:true});
  await writeFile('reports/ball46-snapshot-v1-deploy-preflight.json',JSON.stringify(result,null,2)+'\n');
  console.log('B46_SNAPSHOT_PREFLIGHT='+JSON.stringify({
    activeBefore:result.activeBefore,activeAfter:result.activeAfter,
    changedFiles:result.changedFiles,checks:result.checks,blockers:result.blockers,
    deployment:'BLOCKED_NO_DEPLOY',manifest:result.activeManifest
  }));
}

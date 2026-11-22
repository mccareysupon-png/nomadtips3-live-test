// BALL46 TEST ONLY. Patch three exact UI literals in the CURRENT bundled Worker.
// Never touch original LIVE/Engine/HUB/Pre-Match archive Worker, counts, API or manifests.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {prematchClientScript,prematchStyles} from './prematch-client.mjs';
import {prematchMirrorClientScript,prematchMirrorStyles} from './prematch-live-score-mirror.mjs';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_DEPLOY_CREDENTIALS_REQUIRED');
const worker='ball46-premium-match-colors-test-20261120';
const expectedVersion='0ee31f5a-fac2-4250-9909-8b151224989f';
const baseline='a748f226e0b371c4616778864af0309ea201cfec';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-prematch-only-test-20261120','ball46-prematch-performance-test-20261121'];

async function cf(url,options={}){
  const r=await fetch(url,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
  let response;
  try{response=await r.json()}catch{throw Error('CLOUDFLARE_NON_JSON_'+r.status)}
  assert(r.ok&&response.success,'CLOUDFLARE_'+r.status+' '+JSON.stringify(response.errors||[]));
  return response.result;
}
async function versionOf(name){
  const result=await cf(root+'/scripts/'+name+'/deployments?per_page=1');
  const id=result.deployments?.[0]?.versions?.[0]?.version_id;
  assert(id,'NO_VERSION_FOR_'+name);
  return id;
}
function oldModule(filename){
  const full='qa/prematch-native-ui-20261121/'+filename;
  const text=execFileSync('git',['show',baseline+':'+full],{encoding:'utf8'});
  return import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
}
function locate(source,symbol){
  const prefix='var '+symbol+' = ';
  const start=source.indexOf(prefix);
  assert(start>=0&&source.indexOf(prefix,start+1)<0,'SCRIPT_VARIABLE_MISSING_OR_DUPLICATE_'+symbol);
  const begin=start+prefix.length;
  const quote=source[begin];
  assert(quote===String.fromCharCode(96)||quote==='"','SCRIPT_LITERAL_DRIFT_'+symbol);
  let end=-1;
  for(let i=begin+1;i<source.length;i++){
    if(source[i]==='\\'){i++;continue}
    if(source[i]===quote){end=i;break}
  }
  assert(end>begin&&source[end+1]===';','LITERAL_END_DRIFT_'+symbol);
  const actual=vm.runInNewContext('('+source.slice(begin,end+1)+')',Object.create(null),{timeout:1500});
  assert(typeof actual==='string','SCRIPT_LITERAL_NOT_STRING_'+symbol);
  return {begin,end,actual};
}

const [oldClient,oldMirror]=await Promise.all([oldModule('prematch-client.mjs'),oldModule('prematch-live-score-mirror.mjs')]);
const edits=[
  {name:'prematchClientScript',old:oldClient.prematchClientScript,next:prematchClientScript},
  {name:'prematchStyles',old:oldClient.prematchStyles,next:prematchStyles},
  {name:'prematchMirrorClientScript',old:oldMirror.prematchMirrorClientScript,next:prematchMirrorClientScript}
];
assert(oldMirror.prematchMirrorStyles===prematchMirrorStyles,'MIRROR_STYLES_SHOULD_STAY_UNCHANGED');
assert(prematchStyles.includes('.b46pm-result-badge.win')&&prematchStyles.includes('.b46pm-result-badge.loss'),'RESULT_BADGE_STYLES_MISSING');
assert(prematchClientScript.includes('verifiedLeagueName')&&prematchMirrorClientScript.includes('leagueNameForFixture'),'LEAGUE_FEATURE_MISSING');

const originals=await Promise.all(protectedWorkers.map(versionOf));
const beforeVersion=await versionOf(worker);
assert.equal(beforeVersion,expectedVersion,'TEST_WORKER_VERSION_CHANGED_ABORT_NOT_OVERWRITING');
const active=await cf(root+'/workers/'+worker+'/versions/'+beforeVersion+'?include=modules');
assert.equal(active.main_module,'worker.js','MAIN_MODULE_DRIFT');
assert(active.modules?.length===1&&active.modules[0].name==='worker.js','WORKER_IS_NOT_SINGLE_BUNDLE');
const current=Buffer.from(active.modules[0].content_base64,'base64').toString('utf8');
const settings=await cf(root+'/scripts/'+worker+'/settings');
const names=(settings.bindings||[]).map(b=>b.name).sort();
assert.deepEqual(names,['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE'],'TEST_BINDINGS_CHANGED');
assert((settings.bindings||[]).every(b=>b.type==='service'),'TEST_BINDING_TYPES_CHANGED');

let patched=current;
for(const edit of edits){
  const part=locate(patched,edit.name);
  assert.equal(part.actual,edit.old,'ACTIVE_BUNDLE_SOURCE_DRIFT_'+edit.name);
  assert.notEqual(edit.old,edit.next,'NO_STAGED_CHANGE_'+edit.name);
  // JSON.stringify embeds exactly the already-tested runtime string, safely escaping template syntax.
  patched=patched.slice(0,part.begin)+JSON.stringify(edit.next)+patched.slice(part.end+1);
}
assert(patched!==current&&patched.length>current.length-1000&&patched.length<current.length+50000,'UNEXPECTED_PATCH_SIZE');
const temporary=path.join(os.tmpdir(),'ball46-prematch-test-bundle-check.mjs');
fs.writeFileSync(temporary,patched);
execFileSync(process.execPath,['--check',temporary],{stdio:'pipe'});
const plannedHash=crypto.createHash('sha256').update(patched).digest('hex');
const plan={worker,beforeVersion,changedLiterals:edits.map(x=>x.name),sizeBefore:current.length,sizeAfter:patched.length,sha256:plannedHash,providerCalls:0,productionWrites:0};
console.log('B46_PM_TEST_UI_PATCH_PREFLIGHT '+JSON.stringify(plan));
// Confirm no other deployment has changed the current TEST worker while we prepared the patch.
assert.equal(await versionOf(worker),beforeVersion,'TEST_WORKER_UPDATED_DURING_PREFLIGHT');

const meta={
  main_module:active.main_module,
  compatibility_date:active.compatibility_date||'2026-11-20',
  bindings:names.map(name=>({name,type:'inherit'}))
};
if(Array.isArray(active.compatibility_flags)&&active.compatibility_flags.length)meta.compatibility_flags=active.compatibility_flags;
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([patched],{type:'application/javascript+module'}),'worker.js');
await cf(root+'/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});

let afterVersion;
let proofClient=false,proofMirror=false,proofCss=false;
for(let i=0;i<18;i++){
  try{
    afterVersion=await versionOf(worker);
    const [client,mirror,html]=await Promise.all([
      fetch(host+'/__b46_prematch_client.js',{signal:AbortSignal.timeout(15000)}),
      fetch(host+'/__b46_prematch_mirror.js',{signal:AbortSignal.timeout(15000)}),
      fetch(host+'/?b46pm=predictions&b46pmPeriod=today',{signal:AbortSignal.timeout(18000)})
    ]);
    proofClient=client.ok&&(await client.text())===prematchClientScript;
    proofMirror=mirror.ok&&(await mirror.text())===prematchMirrorClientScript;
    proofCss=html.ok&&(await html.text()).includes('.b46pm-result-badge.win');
    if(afterVersion!==beforeVersion&&proofClient&&proofMirror&&proofCss)break;
  }catch(e){console.log('TEST_PROPAGATION_WAIT '+String(e.message).slice(0,100))}
  await new Promise(resolve=>setTimeout(resolve,1500));
}
assert(afterVersion!==beforeVersion&&proofClient&&proofMirror&&proofCss,'DEPLOYED_UI_SMOKE_NOT_CONFIRMED');
const deployed=await cf(root+'/workers/'+worker+'/versions/'+afterVersion+'?include=modules');
const actualHash=crypto.createHash('sha256').update(Buffer.from(deployed.modules?.[0]?.content_base64||'','base64')).digest('hex');
assert.equal(actualHash,plannedHash,'DEPLOYED_BUNDLE_HASH_MISMATCH');
const bindingAfter=await cf(root+'/scripts/'+worker+'/settings');
assert.deepEqual((bindingAfter.bindings||[]).map(b=>b.name).sort(),names,'TEST_SERVICE_BINDINGS_CHANGED');
const afterProtected=await Promise.all(protectedWorkers.map(versionOf));
assert.deepEqual(afterProtected,originals,'PROTECTED_WORKER_VERSION_CHANGED');
console.log('B46_PREMATCH_TEST_UI_DEPLOY_VERIFIED '+JSON.stringify({
  worker,beforeVersion,afterVersion,sha256:actualHash,
  leagueNames:'FIXTURE_VERIFIED_OR_PENDING',
  resultBadges:'LEDGER_WIN_LOSS_ONLY',
  preservedAccounting:'PICKS_SETTLED_PENDING_UNCHANGED',
  smoke:{client:proofClient,mirror:proofMirror,css:proofCss},
  bindings:names,protectedWorkers,providerCalls:0,productionWrites:0
}));

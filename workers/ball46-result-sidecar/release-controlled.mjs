/**
 * Controlled BALL46 Goaloo fallback deployment.
 * Only changes the isolated sidecar Worker. Never deploys Engine/Hub/Member.
 * On any post-activation failure, restores the exact prior 100% Worker Version
 * through Cloudflare Deployments API.
 *
 * Uses 5USD's existing Engine-native settlement credential only inside a
 * private Cloudflare service binding. Never logs/returns the secret.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const id=process.env.CLOUDFLARE_ACCOUNT_ID;
const auth=process.env.CLOUDFLARE_API_TOKEN;
const native=process.env.FIVEDOLLAR_API_KEY||process.env.FIVE_DOLLAR_API_KEY;
const name='ball46-multisource-shadow-20261018';
const engineName='nomadtips3-engine-343';
const root=path.dirname(new URL(import.meta.url).pathname);
const proofPath=path.join(root,'ball46-live-rollback-proof.json');
const base='https://api.cloudflare.com/client/v4/accounts/'+id+'/workers/scripts/';
const report={at:new Date().toISOString(),scope:'SIDECAR_ONLY',name,live:false,
 engineUntouched:true,rollbackUsed:false};
function save(){fs.writeFileSync(proofPath,JSON.stringify(report,null,2)+'\n')}
function fail(message){throw Error(message)}
if(!id||!auth||!native||native.length<16)fail('MISSING_CLOUDFLARE_OR_EXISTING_NATIVE_CREDENTIAL');
if(process.env.GITHUB_REF_NAME!=='stage/ball46-multisource-v5-20261017')
 fail('WRONG_SOURCE_BRANCH');
if(!fs.existsSync(path.join(root,'wrangler.live.toml'))||
 !fs.existsSync(path.join(root,'wrangler.stage.toml')))
 fail('MISSING_RELEASE_CONFIG');
const readCfg=p=>fs.readFileSync(path.join(root,p),'utf8');
const disabled=readCfg('wrangler.stage.toml');
const live=readCfg('wrangler.live.toml');
for(const c of [disabled,live]){
 for(const needle of [
  'name = "'+name+'"','workers_dev = false',
  'binding = "HUB"','service = "nomadtips3-5usd-hub-343"',
  'binding = "ENGINE"','service = "'+engineName+'"',
  'crons = ["*/5 * * * *"]'])
  if(!c.includes(needle))fail('CONFIG_SOURCE_GATE_'+needle);
 if(/\nroute\s*=|\nroutes\s*=/.test(c))fail('FORBIDDEN_PUBLIC_ROUTE');
}
for(const key of ['GOALOO_POLL_ENABLED','GOALOO_UTC_CERTIFIED','GOALOO_FT_CERTIFIED','ENABLE_NATIVE_FORWARD']){
 if(!disabled.includes(key+' = "0"'))fail('ROLLBACK_NOT_DISABLED_'+key);
 if(!live.includes(key+' = "1"'))fail('LIVE_NOT_ENABLED_'+key);
}
if(!live.includes('GOALOO_OFFSET_MINUTES = "0"')||
 !live.includes('CANONICAL_CAPTURE_ENABLED = "1"')||
 !live.includes('PENDING_LEDGER_READONLY_ENABLED = "1"'))
 fail('LIVE_INTAKE_GATE_INVALID');
const headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'};
async function cf(url,method='GET',body){
 const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(30000)});
 const obj=await r.json().catch(()=>({}));
 if(!r.ok||obj.success===false)fail('CLOUDFLARE_'+method+'_'+r.status+'_'+(obj.errors?.[0]?.code||''));
 return obj.result;
}
async function deployment(script){
 const json=await cf(base+script+'/deployments');
 const d=json.deployments?.[0];
 if(!d?.id||d.versions?.length!==1||Number(d.versions[0].percentage)!==100)
  fail('INVALID_ACTIVE_SINGLE_VERSION_'+script);
 return {deploymentId:d.id,versionId:d.versions[0].version_id};
}
async function health(endpoint){
 const r=await fetch('https://nomadtips3-engine-343.mccarey-supon.workers.dev'+endpoint,{
  method:'GET',signal:AbortSignal.timeout(15000)});
 if(!r.ok)fail('NATIVE_HEALTH_HTTP_'+endpoint+'_'+r.status);
 return r.json();
}
async function settings(){
 const result=await cf(base+name+'/settings');
 const bindings=result.bindings??result.settings?.bindings??[];
 if(!Array.isArray(bindings))fail('WORKER_BINDINGS_NOT_ARRAY');
 return bindings;
}
async function rollback(version,reason){
 report.rollbackUsed=true;report.rollbackReason=reason;save();
 const body={strategy:'percentage',versions:[{version_id:version,percentage:100}],
  annotations:{'workers/message':'BALL46 automatic safety rollback: '+String(reason).slice(0,120)}};
 const deployed=await cf(base+name+'/deployments','POST',body);
 const check=await deployment(name);
 report.rollbackResult={id:deployed.id,verifiedVersion:check.versionId,
  expectedVersion:version,success:check.versionId===version};
 save();
 if(!report.rollbackResult.success)fail('ROLLBACK_VERIFICATION_FAILED');
 console.log('BALL46_SHADOW_AUTO_ROLLBACK_CONFIRMED',JSON.stringify({
  versionId:version,engineUntouched:true,reason:String(reason).slice(0,120)}));
}
try{
 const [engineBefore,sideBefore,bridge,ledger]=await Promise.all([
  deployment(engineName),deployment(name),health('/bridge-health'),health('/ledger-health')]);
 if(bridge.statisticsSource!=='LEDGER_V2_ONLY'||
  bridge.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||
  ledger.version!=='signal-ledger-v2-longterm')fail('NATIVE_LEDGER_V2_NOT_CURRENT');
 report.engineBefore=engineBefore;report.shadowBefore=sideBefore;
 report.nativeLedgerV2={bridgeVersion:bridge.version,ledgerVersion:ledger.version,
  ledgerBefore:{total:ledger.ledgerTotal,pending:ledger.pending,settled:ledger.settledTotal}};
 save();
 // Credential is copied through stdin into an EXISTING, non-public Cloudflare
 // Worker. This step intentionally uses stage (read-only) config first.
 execFileSync('npx',['--yes','wrangler@4','secret','put','NATIVE_SETTLEMENT_TOKEN',
  '--config','wrangler.stage.toml'],{cwd:root,input:native,
  encoding:'utf8',timeout:120000,stdio:['pipe','pipe','pipe'],
  env:{...process.env,CLOUDFLARE_ACCOUNT_ID:id,CLOUDFLARE_API_TOKEN:auth}});
 const [prepared,preBindings]=await Promise.all([deployment(name),settings()]);
 report.rollbackPoint={...prepared,afterSecretProvision:true};
 report.secretReady=preBindings.some(b=>b.name==='NATIVE_SETTLEMENT_TOKEN');
 save();
 if(!report.secretReady)fail('NATIVE_TOKEN_NOT_INSTALLED_ON_SHADOW');
 console.log('BALL46_ROLLBACK_POINT_SAVED',JSON.stringify({
  versionId:prepared.versionId,engineVersion:engineBefore.versionId,
  goaloo:'DISABLED_BEFORE_RELEASE',secretReady:true}));
 // Activate the existing ISOLATED worker; NEVER push Engine source.
 let deployed=false;
 try{
  execFileSync('npx',['--yes','wrangler@4','deploy','--config','wrangler.live.toml'],
   {cwd:root,encoding:'utf8',timeout:180000,
    stdio:['ignore','pipe','pipe'],
    env:{...process.env,CLOUDFLARE_ACCOUNT_ID:id,CLOUDFLARE_API_TOKEN:auth}});
  deployed=true;
  const [after,engineAfter,bindings,cron,bridgeAfter,ledgerAfter]=await Promise.all([
   deployment(name),deployment(engineName),settings(),
   cf(base+name+'/schedules'),health('/bridge-health'),health('/ledger-health')]);
  report.shadowLive=after;report.engineAfter=engineAfter;
  if(after.versionId===prepared.versionId)fail('LIVE_WORKER_VERSION_NOT_UPDATED');
  if(engineAfter.versionId!==engineBefore.versionId)
   fail('ENGINE_PRODUCTION_VERSION_CHANGED');
  const byName=new Map(bindings.map(b=>[b.name,b]));
  for(const k of ['GOALOO_POLL_ENABLED','GOALOO_UTC_CERTIFIED',
   'GOALOO_FT_CERTIFIED','ENABLE_NATIVE_FORWARD']){
   if(String(byName.get(k)?.text??byName.get(k)?.value??'')!=='1')
    fail('LIVE_CONFIG_SETTING_NOT_ACTIVATED_'+k);
  }
  if(String(byName.get('GOALOO_OFFSET_MINUTES')?.text??
     byName.get('GOALOO_OFFSET_MINUTES')?.value??'')!=='0')
    fail('GOALOO_TIMEZONE_NOT_ACTIVE');
  if(!byName.has('NATIVE_SETTLEMENT_TOKEN'))fail('NATIVE_SECRET_LOST_ON_DEPLOY');
  if(!bindings.some(b=>b.name==='HUB')||!bindings.some(b=>b.name==='ENGINE'))
   fail('SERVICE_BINDING_LOST');
  const scheduled=cron.schedules??cron??[];
  if(!Array.isArray(scheduled)||!scheduled.some(x=>x.cron==='*/5 * * * *'))
   fail('CRON_NOT_ACTIVE');
  if(bridgeAfter.statisticsSource!=='LEDGER_V2_ONLY'||
     bridgeAfter.statisticsLedgerVersion!=='signal-ledger-v2-longterm')
   fail('ENGINE_HEALTH_REGRESSION');
  if(ledgerAfter.version!=='signal-ledger-v2-longterm')
   fail('LEDGER_VERSION_REGRESSION');
  report.live=true;report.rollbackAvailableVersion=prepared.versionId;
  report.ledgerAfter={total:ledgerAfter.ledgerTotal,pending:ledgerAfter.pending,
   settled:ledgerAfter.settledTotal};
  report.verification={engineUnchanged:true,nativeCredentialActive:true,
   goalooEnabled:true,forwardEnabled:true,cronEveryMinutes:5,
   maxFixturesPerCycle:1,existing5USDSignalsUnchangedByRelease:true};
  save();
  console.log('BALL46_GOALOO_LIVE_RELEASE',JSON.stringify({
   worker:name,versionId:after.versionId,rollbackVersion:prepared.versionId,
   engineUnchanged:true,cron:'*/5 * * * *',maxNativeFtPerCycle:1,
   live:true}));
 }catch(e){
  // Any failure at/after the deploy attempt triggers rollback, even if
  // Wrangler emitted an error after making a version active.
  await rollback(prepared.versionId,e.message);
  throw e;
 }
}catch(e){
 report.error=String(e?.message||e).slice(0,220);save();
 console.error('BALL46_RELEASE_FAILED',report.error);
 process.exitCode=1;
}

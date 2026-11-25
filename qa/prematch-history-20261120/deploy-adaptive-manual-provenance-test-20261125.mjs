import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const n='ball46-prematch-only-test-20261120',base='5e18378d-add8-40c7-a18c-58f8df40c28a';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,o={}){const r=await fetch(api+path,{...o,headers:{authorization:'Bearer '+token,...o.headers},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success,path+' HTTP '+r.status);return j.result}
async function active(name){return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function deploy(id){return cf('/scripts/'+n+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})})}
const [current,protectedBefore,installed,settings,cron]=await Promise.all([
 active(n),Promise.all(protectedWorkers.map(active)),cf('/workers/'+n+'/versions/'+base+'?include=modules'),
 cf('/scripts/'+n+'/settings'),cf('/scripts/'+n+'/schedules')
]);
assert.equal(current,base,'TEST_OWNER_VERSION_DRIFT');
const modules=new Map(installed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
const target='b46-adaptive-manual-control-page-test.mjs';
const updated=await readFile('qa/prematch-history-20261120/'+target);
assert(!modules.get(target).equals(updated),'MODULE_ALREADY_UPDATED');
assert(updated.toString().includes("String(p.odds_source||'').includes('HISTORICAL_RESEARCH_ONLY')"));
modules.set(target,updated);
const file=join(await mkdtemp(join(tmpdir(),'b46-provenance-')),target);await writeFile(file,updated);execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
const metadata={main_module:installed.main_module,compatibility_date:installed.compatibility_date,
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
if(process.argv.includes('--dry-run')){console.log('B46_MANUAL_PROVENANCE_TEST_PREFLIGHT_PASS '+JSON.stringify({version:base,modules:modules.size,changedOnly:target,cron:cron.schedules.map(x=>x.cron)}));process.exit(0)}
const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const [name,buf] of modules)form.append(name,new Blob([buf],{type:'application/javascript+module'}),name);
let created=null,deployed=false;
try{
 created=(await cf('/scripts/'+n+'/versions?bindings_inherit=strict',{method:'POST',body:form})).id;
 const verified=await cf('/workers/'+n+'/versions/'+created+'?include=modules');
 assert.equal(verified.modules.length,modules.size);
 for(const m of verified.modules)assert(modules.get(m.name)?.equals(Buffer.from(m.content_base64,'base64')),'MODULE_CHANGED_'+m.name);
 assert.equal(await active(n),base);
 await deploy(created);deployed=true;
 assert.equal(await active(n),created);
 assert.deepEqual(await Promise.all(protectedWorkers.map(active)),protectedBefore);
 assert.deepEqual((await cf('/scripts/'+n+'/schedules')).schedules.map(x=>x.cron),cron.schedules.map(x=>x.cron));
 let propagated=false;
 for(let attempt=0;attempt<25;attempt++){
  const html=await fetch('https://'+n+'.mccarey-supon.workers.dev/adaptive-control-test?qa='+attempt,{cache:'no-store',signal:AbortSignal.timeout(25000)});
  const body=await html.text();
  if(html.ok&&body.includes("String(p.odds_source||'').includes('HISTORICAL_RESEARCH_ONLY')")){propagated=true;break}
  if(attempt===0||attempt===10||attempt===24)console.log('B46_MANUAL_PROPAGATION_CHECK '+JSON.stringify({attempt,http:html.status,hasNewLabel:body.includes("String(p.odds_source||'').includes"),hasResearchPanel:body.includes('b46-control-latest')}));
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 assert(propagated,'MANUAL_HTML_NOT_VISIBLE_AFTER_PROPAGATION');
 console.log('B46_MANUAL_PROVENANCE_TEST_DEPLOY_PASS '+JSON.stringify({previous:base,version:created,changedOnly:target,modulesPreserved:modules.size,cronUnchanged:true,protectedWorkersUnchanged:true,productionWrites:0}));
}catch(e){console.log('B46_MANUAL_PROVENANCE_TEST_FAIL '+String(e?.stack||e));if(deployed&&await active(n)===created)await deploy(base);throw e}

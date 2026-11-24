import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const worker='ball46-prematch-only-test-20261120',host='https://'+worker+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const authorization='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,opts={}){
 const r=await fetch(api+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors??[]));return j.result;
}
const ver=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
async function owner(path){
 const r=await fetch(host+path,{headers:{authorization},signal:AbortSignal.timeout(30000),cache:'no-store'});
 assert(r.ok,'TEST '+path+' '+r.status);return r.json();
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const protectBefore=await Promise.all(protectedNames.map(ver));
const oldId=await ver(worker);
const [v,settings,stage,engine]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+oldId+'?include=modules'),cf('/scripts/'+worker+'/settings'),
 owner('/ou-v3-stage-one-audit-test'),owner('/prematch-ou-engine-state')]);
assert.equal(stage.policy.minimumPriceInclusive,1.4);assert.equal(stage.policy.maximumPriceInclusive,10);
assert.equal(engine.policy.minEV,.05);
const oldMods=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const mods={...oldMods},main=v.main_module,n='ou-two-over-then-under25-test.mjs';
assert(!mods[n]);assert(!mods[main].includes('/ou-two-over-then-under25-audit-test'));
function one(s,a,b){assert.equal(s.split(a).length,2);return s.replace(a,b)}
const anchor="import {DurableObject} from 'cloudflare:workers';";
mods[main]=one(mods[main],anchor,anchor+"\nimport {auditTwoOverThenUnder25} from './ou-two-over-then-under25-test.mjs';");
const route=" if(path==='/ou-two-over-then-under25-audit-test'&&req.method==='GET'){\n  const raw=await this.ctx.storage.get('botFixtures')??[];\n  return json(auditTwoOverThenUnder25(this.db,raw,now));\n }\n";
const before=" if(path==='/ou-v3-stage-one-audit-test'&&req.method==='GET'){";
mods[main]=one(mods[main],before,route+before);
mods[n]=fs.readFileSync('qa/prematch-history-20261120/'+n,'utf8');
assert.equal(Object.keys(mods).length,Object.keys(oldMods).length+1);
for(const [name,src] of Object.entries(oldMods))if(name!==main)assert.equal(mods[name],src,'UNRELATED_MODULE_CHANGED '+name);
assert.equal(await ver(worker),oldId,'TEST_CONCURRENT_MODIFICATION');
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [name,src] of Object.entries(mods))form.append(name,new Blob([src],{type:'application/javascript+module'}),name);
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let next=null;
for(let i=0;i<30;i++){
 const id=await ver(worker);
 if(id!==oldId){
  const installed=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  const source=Object.fromEntries(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.entries(mods).every(([name,content])=>source[name]===content)){next=id;break}
 }
 await new Promise(ok=>setTimeout(ok,800));
}
assert(next,'BINARY_MISMATCH');
await cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:next,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let audit=null;
for(let i=0;i<20;i++){
 await new Promise(ok=>setTimeout(ok,1500));
 try{audit=await owner('/ou-two-over-then-under25-audit-test');break}catch{}
}
assert.equal(audit?.code,'B46_TWO_OVER_STREAK_THEN_UNDER25_TEST_AUDIT');
assert.equal(audit.policy.line,2.5);assert.equal(audit.policy.priorMatches,2);
const [newStage,newEngine,protectAfter]=await Promise.all([
 owner('/ou-v3-stage-one-audit-test'),owner('/prematch-ou-engine-state'),
 Promise.all(protectedNames.map(ver))]);
assert.equal(newStage.policy.minimumPriceInclusive,1.4);
assert.equal(newEngine.policy.minEV,.05);
assert.equal(newEngine.shadowCount,engine.shadowCount);
assert.deepEqual(protectAfter,protectBefore);
console.log('B46_STREAK_UNDER25_ACTUAL '+JSON.stringify({
 when:audit.checkedAtUTC,upcoming:audit.stats.validUpcoming,
 matchHistoryEither:audit.stats.matchHistoryEither,
 matchHistoryHome:audit.stats.matchHistoryHome,
 matchHistoryAway:audit.stats.matchHistoryAway,
 matchHistoryBoth:audit.stats.matchHistoryBoth,
 lackingHistory:audit.stats.missingEitherTeamTwoHistory,
 candidates:audit.candidates,noPicksWritten:true,noPaidCalls:true
}).slice(0,25000));
console.log('B46_STREAK_UNDER25_DEPLOY_OK '+next);

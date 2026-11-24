import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const tok=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(tok&&account,'CREDENTIALS_MISSING');
const name='ball46-prematch-only-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const auth='Bearer '+crypto.createHmac('sha256',tok).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(p,opts={}){const r=await fetch(root+p,{...opts,headers:{authorization:'Bearer '+tok,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status);return j.result}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const old=await version(name);
const v=await cf('/workers/'+name+'/versions/'+old+'?include=modules');
const settings=await cf('/scripts/'+name+'/settings');
const sources=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=v.main_module,src=sources[main];
const oldImport="import {initOuTargetHistoryFT,importOuTargetHistoryFT,ouTargetHistoryCoverage,OU_TARGET_HISTORY_CODE} from './ou-target-history-ft-v1-test.mjs';";
const newImport="import {initOuTargetHistoryFT,importOuTargetHistoryFT,ouTargetHistoryCoverage,ouTargetLastMatches,OU_TARGET_HISTORY_CODE} from './ou-target-history-ft-v1-test.mjs';";
const anchor=" if(path==='/ou-history-ft-import-test'&&req.method==='POST'){";
assert.equal(src.split(oldImport).length,2,'IMPORT_DRIFT');
assert.equal(src.split(anchor).length,2,'ROUTE_DRIFT');
const auditRoute=[
 " if(path==='/ou-history-per-fixture-audit-test'&&req.method==='GET'){",
 "  const fixtures=(await this.ctx.storage.get('botFixtures')??[]).filter(f=>",
 "   ['scheduled','upcoming','waiting'].includes(String(f?.status??'').toLowerCase())&&",
 "   Number.isSafeInteger(f?.kickoff_ts)&&f.kickoff_ts>now&&",
 "   Number.isSafeInteger(Number(f?.teams?.home?.id))&&Number(f.teams.home.id)>0&&",
 "   Number.isSafeInteger(Number(f?.teams?.away?.id))&&Number(f.teams.away.id)>0);",
 "  const rows=fixtures.map(f=>{",
 "   const h=ouTargetLastMatches(this.db,Number(f.teams.home.id),f.kickoff_ts,now,10).length;",
 "   const a=ouTargetLastMatches(this.db,Number(f.teams.away.id),f.kickoff_ts,now,10).length;",
 "   return {fixtureId:Number(f.id),league:String(f.league?.name??''),",
 "    home:String(f.teams.home.name??f.teams.home.id),homeHistory:h,",
 "    away:String(f.teams.away.name??f.teams.away.id),awayHistory:a,",
 "    kickoffUTC:new Date(f.kickoff_ts*1000).toISOString(),",
 "    ready3:h>=3&&a>=3,anyHistory:h>0||a>0};",
 "  }).sort((a,b)=>Number(b.ready3)-Number(a.ready3)||a.kickoffUTC.localeCompare(b.kickoffUTC));",
 "  const counts={upcoming:rows.length,ready3:rows.filter(x=>x.ready3).length,",
 "   anyHistory:rows.filter(x=>x.anyHistory).length,neitherHasHistory:rows.filter(x=>!x.anyHistory).length,",
 "   incomplete:rows.filter(x=>!x.ready3).length};",
 "  return json({code:'B46_OU_HISTORY_PER_FIXTURE_READ_ONLY_V1',",
 "   checkedAtUTC:new Date(now*1000).toISOString(),counts,",
 "   archive:ouTargetHistoryCoverage(this.db),fixtures:rows,providerCalls:0,productionWrites:0});",
 " }"
].join('\n');
sources[main]=src.replace(oldImport,newImport).replace(anchor,auditRoute+'\n'+anchor);
const metadata={main_module:main,compatibility_date:v.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(v.compatibility_flags?.length?{compatibility_flags:v.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(sources))form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
assert.equal(await version(name),old,'CONCURRENT_CHANGE');
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let deployed=null;
for(let i=0;i<42;i++){
 const id=await version(name);
 if(id!==old){
  const v2=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
  const found=Object.fromEntries(v2.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(found).length===Object.keys(sources).length&&Object.entries(sources).every(([n,s])=>found[n]===s)){deployed=id;break}
 }
 await new Promise(ok=>setTimeout(ok,750));
}
assert(deployed,'NEW_VERSION_NOT_VERIFIED');
await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:deployed,percentage:100}],code_update_strategy:{mode:'immediate'}})});
let report=null;
for(let i=0;i<28;i++){
 await new Promise(ok=>setTimeout(ok,i===0?2800:1300));
 const rr=await fetch('https://'+name+'.mccarey-supon.workers.dev/ou-history-per-fixture-audit-test',{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(rr.ok){const d=await rr.json();if(d.code==='B46_OU_HISTORY_PER_FIXTURE_READ_ONLY_V1'){report=d;break}}
}
assert(report,'REPORT_UNAVAILABLE');
assert.equal(report.counts.ready3,report.fixtures.filter(x=>x.homeHistory>=3&&x.awayHistory>=3).length);
const pAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(pAfter,protectedBefore,'PRODUCTION_VERSION_CHANGED');
console.log('B46_FT_PER_FIXTURE_SUMMARY '+JSON.stringify({asOf:report.checkedAtUTC,archiveFT:report.archive.ft,...report.counts,productionUntouched:true}));
console.log('B46_FT_PER_FIXTURE_READY '+JSON.stringify(report.fixtures.filter(x=>x.ready3)));
console.log('B46_FT_PER_FIXTURE_REMAINING '+JSON.stringify(report.fixtures.filter(x=>!x.ready3)));
console.log('B46_FT_PER_FIXTURE_AUDIT_PASS');

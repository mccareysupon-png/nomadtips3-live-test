import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const account='62cb0db544160e6591342abd6b4f35cc',base='02108724-ac78-4575-a98a-f7ee40053814';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,account);
const report={at:new Date().toISOString(),mode:'READ_ONLY',providerRequests:0,productionWrites:0};
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED_'+r.status);return j.result;}
await mkdir('audit',{recursive:true});
try{
 const deployments=await cf('/workers/scripts/ball46-production/deployments?per_page=1');
 report.deployment=deployments.deployments[0];assert.deepEqual(report.deployment.versions,[{version_id:base,percentage:100}],'ACTIVE_CHANGED_STOP');
 report.bindings={};
 for(const worker of ['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46']){const s=await cf('/workers/scripts/'+worker+'/settings');report.bindings[worker]=s.bindings.map(b=>({name:b.name,type:b.type,service:b.service}));}
 const r=await fetch('https://ball46.com/api/engine/board',{signal:AbortSignal.timeout(45000)});const board=await r.json();assert(r.ok&&board.ok&&!board.stale,'BOARD_UNAVAILABLE');
 const fixture=board.fixtures.find(f=>['scheduled','live'].includes(f.boardState)&&f.home?.id&&f.away?.id&&f.kickoffUtc);assert(fixture,'NO_REAL_TEAM_IDS');
 report.fixture={fixtureId:fixture.fixtureId,home:fixture.home,away:fixture.away,kickoffUtc:fixture.kickoffUtc,boardState:fixture.boardState};
 const key=process.env.FIVEDOLLAR_API_KEY;
 report.githubProviderSecretAvailable=Boolean(key);
 report.provider=[];
 if(key){for(const team of [fixture.home,fixture.away]){
  const url=new URL('https://api.5dollarfootballapi.com/v1/teams/'+encodeURIComponent(team.id)+'/fixtures');url.search=new URLSearchParams({status:'finished',order:'desc',per_page:'5',end_time:String(Math.floor(Math.min(Date.now(),Date.parse(fixture.kickoffUtc))/1000))});
  report.providerRequests++;const res=await fetch(url,{headers:{authorization:'Bearer '+key,accept:'application/json'},signal:AbortSignal.timeout(25000)});let data;try{data=await res.json();}catch{data={error:'NON_JSON'};}
  report.provider.push({teamId:team.id,status:res.status,retryAfter:res.headers.get('retry-after'),data});if(!res.ok)break;
 }}
 report.ok=true;
}catch(e){report.ok=false;report.error=String(e.message);process.exitCode=1;}
const serialized=JSON.stringify(report,null,2);await writeFile('audit/probe.json',process.env.FIVEDOLLAR_API_KEY?serialized.replaceAll(process.env.FIVEDOLLAR_API_KEY,'[REDACTED]'):serialized);
console.log(JSON.stringify({ok:report.ok,error:report.error,active:report.deployment?.versions,secretAvailable:report.githubProviderSecretAvailable,fixture:report.fixture,providerRequests:report.providerRequests,provider:report.provider?.map(p=>({teamId:p.teamId,status:p.status,count:p.data?.data?.length,success:p.data?.success,error:p.data?.error}))}));

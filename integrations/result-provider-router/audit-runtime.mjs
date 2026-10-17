import fs from "node:fs";
const startedAt=new Date().toISOString();
const exactTargets=["201654042","202917416"];
const allow={
  engineHealth:"https://nomadtips3-engine-343.mccarey-supon.workers.dev/health",
  engineBoard:"https://nomadtips3-engine-343.mccarey-supon.workers.dev/board",
  engineSignals:"https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals",
  hubSnapshot:"https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot",
  siteStats:"https://ball46.com/api/engine/statistics?paged=1&limit=1",
  siteHistory:"https://ball46.com/api/engine/history?limit=500"
};
async function get(url,headers={}){
 try{
  const response=await fetch(url,{headers:{"accept":"application/json",...headers},signal:AbortSignal.timeout(20000),redirect:"error"});
  if(!response.ok)return {http:response.status,error:"HTTP_NOT_OK"};
  const len=Number(response.headers.get("content-length")||0);
  if(len>20000000)return{http:200,error:"BODY_TOO_LARGE"};
  const body=await response.text();if(body.length>20000000)return{http:200,error:"BODY_TOO_LARGE"};
  try{return{http:200,json:JSON.parse(body)}}catch{return{http:200,error:"NON_JSON"}}
 }catch(e){return{error:String(e?.message||e).slice(0,120)}}
}
function summarizeSource(k,x){
 if(!x.json)return{http:x.http||null,error:x.error||null};
 const j=x.json,records=Array.isArray(j.signals)?j.signals:Array.isArray(j.fixtures)?j.fixtures:Array.isArray(j.rows)?j.rows:Array.isArray(j.records)?j.records:Array.isArray(j.history)?j.history:[];
 const ids=new Set(records.map(s=>String(s.fixtureId??s.fixture_id??s.id??"")));
 const targetMatches=records.filter(s=>exactTargets.includes(String(s.fixtureId??s.fixture_id??s.id??""))).map(r=>({
   fixtureId:String(r.fixtureId??r.fixture_id??r.id),
   keys:Object.keys(r).filter(k=>/kickoff|start|league|home|away|status|fixture|date|time|result|score|created|entry/i.test(k)).slice(0,35),
   kickoffUtc:r.kickoffUtc??r.kickoff_utc??r.kickoffAt??null,
   league:typeof r.league==="object"?r.league?.name??null:r.league??null
 }));
 return{http:200,rootKeys:Object.keys(j).slice(0,32),version:j.version??null,recordCount:records.length,
  pending:records.filter(s=>String(s.status||s.result||"").toUpperCase()==="PENDING").length,
  originalKickoffFieldCount:records.filter(s=>Boolean(s.kickoffUtc??s.kickoff_utc??s.kickoffAt)).length,
  targetMatches};
}
function deployments(v){
 const a=v?.result?.deployments??v?.result??[];
 if(!Array.isArray(a))return{ok:!!v?.success,parse:"UNEXPECTED_RESPONSE"};
 return{ok:!!v?.success,count:a.length,
  latest:a.slice(0,4).map(d=>({
   deploymentId:d.id??null,createdOn:d.created_on??null,
   versions:Array.isArray(d.versions)?d.versions.map(x=>({versionId:x.version_id??x.id??null,percentage:x.percentage??null})):[],
   strategy:d.strategy??null}))};
}
async function main(){
 const results=Object.fromEntries(await Promise.all(Object.entries(allow).map(async([k,url])=>[k,await get(url)])));
 const apiToken=process.env.CLOUDFLARE_API_TOKEN,accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
 let cf={configured:!!(apiToken&&accountId),status:"SKIPPED_MISSING_ACCOUNT_READ_ACCESS"};
 if(apiToken&&accountId){
  const base="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/workers/scripts/nomadtips3-engine-343";
  const r=await get(base+"/deployments",{Authorization:"Bearer "+apiToken});
  cf=r.json?{configured:true,...deployments(r.json)}:{configured:true,http:r.http??null,error:r.error};
 }
 const summarized=Object.fromEntries(Object.entries(results).map(([k,v])=>[k,summarizeSource(k,v)]));
 const signalRows=results.engineSignals.json?.signals||[];
 const hubRows=results.hubSnapshot.json?.fixtures||[];
 const boardRows=results.engineBoard.json?.fixtures||results.engineBoard.json?.board?.fixtures||[];
 const ids=new Set(hubRows.map(r=>String(r.fixtureId??r.id)));
 const boardIds=new Set(boardRows.map(r=>String(r.fixtureId??r.id)));
 const pending=signalRows.filter(s=>String(s.status??s.result??"").toUpperCase()==="PENDING");
 const uniquePending=[...new Set(pending.map(s=>String(s.fixtureId)))];
 const missingPending=uniquePending.filter(x=>!ids.has(x));
 const boardRecover=missingPending.filter(x=>boardIds.has(x));
 const report={audit:"BALL46_PRODUCTION_SETTLEMENT_READONLY",startedAt,generatedAt:new Date().toISOString(),
  worker:cf,sources:summarized,
  pending:{signals:pending.length,fixtures:uniquePending.length,missingFromLiveHub:missingPending.length,recoveredByBoard:boardRecover.length,
    targetIds:exactTargets.map(id=>({id,inHub:ids.has(id),inBoard:boardIds.has(id),inSignal:uniquePending.includes(id)}))},
  release:"HOLD",productionWrites:0};
 fs.writeFileSync("ball46-settlement-owner-readonly.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({productionWrites:0,worker:cf,paths:Object.fromEntries(Object.entries(summarized).map(([k,v])=>[k,{http:v.http,error:v.error,version:v.version,recordCount:v.recordCount}])),pending:report.pending,release:"HOLD"}));
}
await main();

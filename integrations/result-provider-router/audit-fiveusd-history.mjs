import fs from "node:fs";
const base="https://api.5dollarfootballapi.com/v1/fixtures/";
const engine="https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals";
const hub="https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot";
const token=process.env.FIVEDOLLAR_API_KEY;
const safeGet=async(url,authenticated=false)=>{
  try{
    const res=await fetch(url,{method:"GET",headers:authenticated?{Authorization:"Bearer "+token,Accept:"application/json"}:{Accept:"application/json"},
      redirect:"error",signal:AbortSignal.timeout(15000)});
    const body=await res.text();
    if(body.length>3000000)return {http:res.status,error:"LARGE_RESPONSE"};
    if(!res.ok)return {http:res.status,error:"HTTP_ERROR"};
    try{return {http:res.status,data:JSON.parse(body)}}catch{return{http:res.status,error:"BAD_JSON"}}
  }catch(e){return{error:String(e?.message||e).slice(0,120)}}
};
const clean=x=>String(x??"").trim();
const label=v=>typeof v==="string"?v:v?.name||"";
const out={at:new Date().toISOString(),mode:"READ_ONLY_5USD_HISTORICAL_IDENTITY_AUDIT",secretConfigured:!!token,source:"5DollarFootballAPI",calls:0,writes:0,records:[],summary:{}};
const [s,h]=await Promise.all([safeGet(engine),safeGet(hub)]);
const signals=Array.isArray(s.data?.signals)?s.data.signals:[];
const live=new Set((h.data?.fixtures||[]).map(x=>clean(x.fixtureId)));
const missing=[...new Set(signals.filter(x=>/PENDING/i.test(clean(x.status))).map(x=>clean(x.fixtureId)).filter(x=>x&&!live.has(x)))].slice(0,35);
out.summary={engineAccessible:!!s.data,hubAccessible:!!h.data,missingIdCount:missing.length,liveFixtureCount:live.size};
for(const id of missing){
  const row=signals.find(x=>clean(x.fixtureId)===id);
  const item={fixtureId:id,engineLeague:label(row?.league),home:label(row?.home),away:label(row?.away)};
  if(!token){item.state="NO_API_SECRET";out.records.push(item);continue;}
  const r=await safeGet(base+encodeURIComponent(id),true);out.calls++;
  if(!r.data?.data){item.state="API_NOT_AVAILABLE";item.http=r.http??null;item.error=r.error??null;out.records.push(item);continue;}
  const f=r.data.data,providerId=clean(f.id);
  item.apiId=providerId;
  item.apiLeague=label(f.league);
  item.apiHome=label(f.teams?.home),item.apiAway=label(f.teams?.away);
  item.kickoffUtc=f.kickoff_utc??null;
  item.providerStatus=f.status??null;
  item.idExact=providerId===id;
  const norm=x=>clean(x).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  item.teamExact=norm(item.home)===norm(item.apiHome)&&norm(item.away)===norm(item.apiAway);
  item.leagueExact=norm(item.engineLeague)===norm(item.apiLeague);
  item.kickoffValid=typeof item.kickoffUtc==="string"&&/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.kickoffUtc)&&Number.isFinite(Date.parse(item.kickoffUtc));
  item.state=item.idExact&&item.teamExact&&item.leagueExact&&item.kickoffValid?"VERIFIED_IDENTITY":"HOLD_REVIEW";
  out.records.push(item);
}
out.summary={...out.summary,calls:out.calls,verified:out.records.filter(x=>x.state==="VERIFIED_IDENTITY").length,
  review:out.records.filter(x=>x.state==="HOLD_REVIEW").length,notAvailable:out.records.filter(x=>x.state==="API_NOT_AVAILABLE").length};
fs.writeFileSync("fiveusd-history-identity-readonly.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({mode:out.mode,secretConfigured:out.secretConfigured,writes:0,summary:out.summary,
  examples:out.records.slice(0,3).map(x=>({fixtureId:x.fixtureId,state:x.state}))}));

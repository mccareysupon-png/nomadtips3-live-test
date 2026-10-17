import fs from "node:fs";
const hub="https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot";
const goaloo="https://live10.goaloo28.com/gf/data/bf_us.js";
const norm=v=>String(typeof v==="string"?v:v?.name||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g," ").trim().replace(/\s+/g," ");
const parse=s=>{let parts=[],buf="",q=null,esc=false;for(const c of s){
 if(q){if(esc){buf+=c;esc=false}else if(c==="\\")esc=true;else if(c===q)q=null;else buf+=c}
 else if(c==="'"||c==='"')q=c;else if(c===","){parts.push(buf.trim());buf=""}else buf+=c;
}parts.push(buf.trim());return parts};
const read=async(url)=>{const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error("HTTP_"+r.status);return r.text()};
const report={at:new Date().toISOString(),mode:"READ_ONLY_GOALOO_TIMEZONE_EVIDENCE",writes:0,ok:false,samples:[],offsetDistribution:{},matched:0,distinctLeagues:0,timeZoneCertified:false};
try{
 const [raw,j]=await Promise.all([read(goaloo),read(hub).then(JSON.parse)]);
 const fixtures=Array.isArray(j.fixtures)?j.fixtures:[];
 const B=new Map(),A=[];
 for(const m of raw.matchAll(/B\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const a=parse(m[2]);B.set(Number(m[1]),a[2]||"")
 }
 for(const m of raw.matchAll(/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const a=parse(m[2]);if(a.length<11)continue;
  A.push({id:a[0],league:B.get(Number(a[1]))||"",home:a[4],away:a[5],raw:a[6],state:a[8]})
 }
 const h=new Map();
 for(const x of fixtures){
  const key=norm(x.home)+"|"+norm(x.away);
  const list=h.get(key)||[];list.push(x);h.set(key,list)
 }
 const leagues=new Set();
 for(const a of A){
  const hits=h.get(norm(a.home)+"|"+norm(a.away))||[];
  if(hits.length!==1)continue;
  const f=hits[0],utc=f.kickoffUtc;
  if(!utc||typeof utc!=="string"||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(utc))continue;
  const local=Date.parse(String(a.raw).replace(" ","T")+"Z"),primary=Date.parse(utc);
  if(!Number.isFinite(local)||!Number.isFinite(primary))continue;
  const offset=Math.round((local-primary)/60000);
  if(Math.abs(offset)>14*60)continue;
  const equalLeague=norm(a.league)===norm(f.league);
  report.offsetDistribution[offset]=(report.offsetDistribution[offset]||0)+1;
  report.matched++;
  if(equalLeague)leagues.add(norm(a.league));
  if(report.samples.length<55)report.samples.push({fiveUsdId:String(f.fixtureId),
    goalooId:String(a.id),fiveUsdLeague:String(f.league?.name||f.league||""),
    goalooLeague:a.league,equalLeague,primaryKickoffUtc:utc,sourceRawKickoff:a.raw,offsetMinutes:offset});
 }
 report.ok=true;
 report.goalooFixtureCount=A.length;
 report.hubFixtureCount=fixtures.length;
 report.distinctLeagues=leagues.size;
 report.note="Paired names alone are not provider ID mapping authorization; independent source documentation is still required";
}catch(e){report.error=String(e?.message||e).slice(0,180)}
fs.writeFileSync("goaloo-timezone-readonly.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({ok:report.ok,matched:report.matched,distinctLeagues:report.distinctLeagues,
 offsets:report.offsetDistribution,certified:false,writes:0,error:report.error}));

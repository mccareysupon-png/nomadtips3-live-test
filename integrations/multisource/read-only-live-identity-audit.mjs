import fs from 'node:fs';
import {normalizedName} from './cross-source-fixture-mapper.mjs';
const hub='https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot';
const feed='https://live10.goaloo28.com/gf/data/bf_us.js';
function cells(s){
 const out=[];let b='',quote=null,esc=false;
 for(const ch of s){
  if(quote){if(esc){b+=ch;esc=false}else if(ch==='\\')esc=true;
   else if(ch===quote)quote=null;else b+=ch}
  else if(ch==="'"||ch==='"')quote=ch;else if(ch===','){out.push(b.trim());b=''}else b+=ch;
 }
 out.push(b.trim());return out;
}
const sourceName=x=>typeof x==='string'?x:x?.name??'';
async function get(url){
 const r=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('READ_HTTP_'+r.status);
 const t=await r.text();if(t.length>12_000_000)throw Error('OVERSIZED_FEED');return t;
}
const report={mode:'READ_ONLY_FIXTURE_SHADOW_NO_MAPPING',generatedAt:new Date().toISOString(),
 productionWrites:0,mappedToProduction:0,timezoneCertified:false,leagueAliasCertified:false,
 samplePairs:[],offsetHistogram:{},leagueNameDisagreements:0,unambiguousHomeAway:0,
 note:'Not an accuracy measurement. Name-only provisional matches are never used for settlement.'};
try{
 const [g,h]=await Promise.all([get(feed),get(hub).then(JSON.parse)]);
 const fixtures=Array.isArray(h.fixtures)?h.fixtures:[];
 const B=new Map(),A=[];
 for(const m of g.matchAll(/B\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const a=cells(m[2]);B.set(Number(m[1]),a[2]||'')
 }
 for(const m of g.matchAll(/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const a=cells(m[2]);if(a.length<11)continue;
  A.push({id:a[0],home:a[4],away:a[5],league:B.get(Number(a[1]))||'',raw:a[6]});
 }
 report.hubFixtures=fixtures.length;report.goalooFixtures=A.length;
 const canonByName=new Map();
 for(const f of fixtures){
  const key=normalizedName(f.home)+'|'+normalizedName(f.away);
  const rows=canonByName.get(key)||[];rows.push(f);canonByName.set(key,rows);
 }
 for(const a of A){
  const matches=canonByName.get(normalizedName(a.home)+'|'+normalizedName(a.away))||[];
  if(matches.length!==1)continue;
  const f=matches[0];
  if(!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(a.raw))continue;
  const ts=Date.parse(a.raw.replace(' ','T')+'Z'),ref=Date.parse(f.kickoffUtc);
  if(!Number.isFinite(ts)||!Number.isFinite(ref))continue;
  const delta=Math.round((ts-ref)/60000);
  if(Math.abs(delta)>840)continue;
  report.unambiguousHomeAway++;
  if(!report.leaguePairCounts)report.leaguePairCounts={};
  const leaguePair=JSON.stringify([String(a.league),sourceName(f.league)]);
  report.leaguePairCounts[leaguePair]=(report.leaguePairCounts[leaguePair]||0)+1;
  report.offsetHistogram[delta]=(report.offsetHistogram[delta]||0)+1;
  const l1=normalizedName(a.league),l2=normalizedName(f.league);
  if(l1!==l2)report.leagueNameDisagreements++;
  if(report.samplePairs.length<80)report.samplePairs.push({
    fixtureId:String(f.fixtureId),sourceFixtureId:String(a.id),
    home:a.home,away:a.away,goalooLeague:a.league,
    primaryLeague:sourceName(f.league),
    rawKickoff:a.raw,primaryKickoffUtc:f.kickoffUtc,
    offsetMinutes:delta,leagueExact:l1===l2,
    approved:false
  });
 }
 report.topLeaguePairs=Object.entries(report.leaguePairCounts||{}).map(([k,n])=>({
  pair:JSON.parse(k),matches:n
 })).sort((a,b)=>b.matches-a.matches).slice(0,20);
 delete report.leaguePairCounts;
 report.ok=true;
}catch(e){report.ok=false;report.error=String(e?.message||e).slice(0,200)}
fs.writeFileSync('ball46-fixture-shadow-evidence.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,ok:report.ok,
 goaloo:report.goalooFixtures,hub:report.hubFixtures,
 provisionalPairs:report.unambiguousHomeAway,offsets:report.offsetHistogram,
 leagueDifferences:report.leagueNameDisagreements,
 topLeaguePairs:report.topLeaguePairs?.slice(0,12),mappedToProduction:0,
 error:report.error}));

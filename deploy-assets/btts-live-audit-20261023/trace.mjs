import {mkdir,writeFile} from 'node:fs/promises';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!acc||!token)throw Error('MISSING_CREDS');
async function json(path){const u=new URL('https://ball46.com'+path);u.searchParams.set('bttsTrace',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error(path+r.status);return r.json();}
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acc+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF:'+r.status);return j.result;}
const board=await json('/api/engine/board');const full=await json('/api/full-market/health');
const fs=board.fixtures.filter(f=>f.boardState==='live'||f.status==='in_play'||f.status==='live');
const keys=o=>o&&typeof o==='object'?Object.keys(o):[];
const state=f=>({yes:f.analysis?.ft_btts_yes?.state||null,no:f.analysis?.ft_btts_no?.state||null});
const all={time:new Date().toISOString(),liveCount:fs.length,rawCount:board.fixtures.length,cache:board.fullMarketCache,health:{mode:full.mode,providerMeta:full.providerMeta,bookmakerCount:full.bookmakerCount,callsLast60s:full.callsLast60s,remainingLocalBudget:full.remainingLocalBudget,blockedUntil:full.blockedUntil,prewarmMeta:full.prewarmMeta},oddsSources:{},stateBuckets:{},examples:[],bttsTraces:[],engineFunctions:[]};
let smax=0;
for(const f of fs){
 const s=state(f),name=(s.yes||'-')+'|'+(s.no||'-');all.stateBuckets[name]=(all.stateBuckets[name]||0)+1;
 for(const key of ['fullOdds','providerOdds','centralFullMarketCached','fullOddsSource']){const obj=f[key],shape=Array.isArray(obj)?'array':typeof obj;
  const id=key+':'+shape+':'+(obj&&typeof obj==='object'?keys(obj).slice(0,12).join(','):'');
  all.oddsSources[id]=(all.oddsSources[id]||0)+1;
 }
 let found=[],queue=[{x:f.fullOdds||{},p:'$.fullOdds',d:0},{x:f.providerOdds||{},p:'$.providerOdds',d:0},{x:f.centralFullMarketCached||{},p:'$.central',d:0}],walk=0,seen=new WeakSet();
 while(queue.length&&walk++<18000){
  const {x,p,d}=queue.pop();if(!x||typeof x!=='object'||seen.has(x)||d>10)continue;seen.add(x);
  for(const [k,v]of Object.entries(x)){
   const nk=k.toLowerCase();
   if(/btts|both.?teams.?to.?score|bothteamsscore|bothscore/.test(nk)||(['name','market','type','market_key','marketType'].includes(k)&&/btts|both.team/i.test(String(v)))){
    if(found.length<8)found.push({path:p+'.'+k,value:JSON.stringify(v).slice(0,450)});
   }
   if(v&&typeof v==='object')queue.push({x:v,p:p+'.'+k,d:d+1});
  }
 }
 if(found.length){all.bttsTraces.push({fixture:f.fixtureId,minute:f.minute,score:f.goals,state:s,found:found.slice(0,3),fullOddsSource:f.fullOddsSource});}
 if(all.examples.length<8 && (s.yes==='EVIDENCE'||s.no==='PRICE_REFEREE_UNAVAILABLE'||s.no==='NO_MATCHING_LINE_PRICE')){
  all.examples.push({fixture:f.fixtureId,minute:f.minute,goals:f.goals,state:s,fullOddsSource:f.fullOddsSource,fullOddsFetchedAt:f.fullOddsFetchedAt,fullOddsShape:keys(f.fullOdds).slice(0,30),providerOddsShape:keys(f.providerOdds).slice(0,30),centralCachedShape:keys(f.centralFullMarketCached).slice(0,30),analysisYes:f.analysis.ft_btts_yes,analysisNo:f.analysis.ft_btts_no,possibleBtts:found.slice(0,4)});
 }
}
const ver=(await cf('/workers/scripts/nomadtips3-engine-343/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await cf('/workers/workers/nomadtips3-engine-343/versions/'+ver+'?include=modules');const src=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
for(const token of ['NO_MATCHING_LINE_PRICE','PRICE_REFEREE_UNAVAILABLE','EVIDENCE', 'function preCandidatesForRule','function priceForSelection','function findMarket','function periodEligible','function livePrice']){let i=-1,n=0;while((i=src.indexOf(token,i+1))>=0&&n++<3)all.engineFunctions.push({term:token,at:i,text:src.slice(Math.max(0,i-600),i+token.length+1050).slice(0,1900)});}
await mkdir('audit',{recursive:true});await writeFile('audit/btts-price-trace.json',JSON.stringify(all,null,2));
console.log('B46_BTTS_PRICE_TRACE='+JSON.stringify({time:all.time,liveCount:all.liveCount,health:all.health,cache:all.cache,stateBuckets:all.stateBuckets,oddsSources:all.oddsSources,examples:all.examples.slice(0,5),bttsFound:all.bttsTraces.length,bttsTraces:all.bttsTraces.slice(0,5),engineFunctions:all.engineFunctions.map(x=>({term:x.term,text:x.text.slice(0,1100)}))}).slice(0,45000));

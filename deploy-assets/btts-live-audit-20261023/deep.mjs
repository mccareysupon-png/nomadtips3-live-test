import {mkdir,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('MISSING_READONLY_CREDS');
async function json(path){const u=new URL('https://ball46.com'+path);u.searchParams.set('bttsDeepAudit',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});if(r.status!==200)throw Error(path+':'+r.status);return r.json();}
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)}),j=await r.json();if(!j.success||!r.ok)throw Error('CF_'+r.status);return j.result;}
const board=await json('/api/engine/board'),signals=await json('/api/engine/signals');
const f=Array.isArray(board.fixtures)?board.fixtures:[],matches=f;
const current={fixtureCount:matches.length,counts:board.counts,runState:board.runState,hubAgeMs:board.hubAgeMs,stale:board.stale,cacheKeys:Object.keys(board.fullMarketCache||{}),fixtureShapes:matches.slice(0,2).map(x=>({keys:Object.keys(x),analysisKeys:Object.keys(x.analysis||{}),marketKeys:Object.keys(x.markets||{}),oddsKeys:Object.keys(x.odds||{})}))};
const out={time:new Date().toISOString(),current,states:{ft_btts_yes:{},ft_btts_no:{}},examples:[],pricedMarkets:[],engineBlocks:[],rawBtts:null};
function inc(a,k){a[k]=(a[k]||0)+1}
for(const match of matches){
 for(const key of ['ft_btts_yes','ft_btts_no']){const a=match.analysis?.[key];const state=typeof a==='string'?a:a?.state??(a==null?'MISSING':'UNSET');inc(out.states[key],String(state));}
 const repr=JSON.stringify(match);if(repr.toLowerCase().includes('"btts"')||repr.toLowerCase().includes('"bothteamstoscore"')){
  const o=match.odds||match.markets||match.prices||{};
  if(out.pricedMarkets.length<8)out.pricedMarkets.push({fixture:match.fixtureId||match.id,minute:match.minute??match.liveMinute,keys:Object.keys(match).slice(0,40),marketKeyList:Object.keys(o).slice(0,80),bttsValues:Object.entries(o).filter(([k,v])=>/btts|both|score/i.test(k)).map(([k,v])=>({key:k,detail:JSON.stringify(v).slice(0,600)}))});
 }
 const a=match.analysis||{};
 if(out.examples.length<10&&a.ft_btts_yes){out.examples.push({fixture:match.fixtureId||match.id,league:match.league,minute:match.minute,score:match.score,status:match.status,meta:match.meta,yes:a.ft_btts_yes,no:a.ft_btts_no,keys:Object.keys(match).slice(0,50),markets:match.markets?Object.keys(match.markets).slice(0,40):undefined,odds:match.odds?Object.keys(match.odds).slice(0,40):undefined});}
}
const version=(await cf('/workers/scripts/nomadtips3-engine-343/deployments?per_page=1')).deployments[0].versions[0].version_id;
const w=await cf('/workers/workers/nomadtips3-engine-343/versions/'+version+'?include=modules');
const main=w.modules.find(m=>m.name===w.main_module),src=Buffer.from(main.content_base64,'base64').toString('utf8');
const needleList=['ft_btts_yes:', 'ft_btts_no:','state: "TIME"',"state:'TIME'",'kind === "BTTS"','kind==="BTTS"','provider === "btts"','provider==="btts"','case "BTTS"','case \'BTTS\''];
for(const term of needleList){let i=-1,n=0;while((i=src.indexOf(term,i+1))>=0&&n++<4)out.engineBlocks.push({term,offset:i,excerpt:src.slice(Math.max(0,i-350),i+term.length+1000).slice(0,1500)});}
const near=(term,limit=8)=>{let re=new RegExp(term,'gi'),m,n=0;while((m=re.exec(src))&&n++<limit){if(!out.engineBlocks.some(b=>Math.abs(b.offset-m.index)<80))out.engineBlocks.push({term,offset:m.index,excerpt:src.slice(Math.max(0,m.index-280),Math.min(src.length,m.index+650))});}};
near('BTTS',15);near('\\bTIME\\b',15);
out.signalCount=signals.signals?.length;out.signalMarkets={};for(const s of signals.signals||[])inc(out.signalMarkets,s.market||s.marketKey||s.type||'unknown');
out.signalSample=(signals.signals||[]).slice(0,3).map(s=>({keys:Object.keys(s),market:s.market,odd:s.odds,bookmaker:s.bookmaker,minute:s.minute,fixture:s.fixtureId}));
await mkdir('audit',{recursive:true});await writeFile('audit/btts-deep.json',JSON.stringify(out,null,2));
console.log('B46_BTTS_DEEP='+JSON.stringify({current:out.current,states:out.states,examples:out.examples.slice(0,4),pricedMarkets:out.pricedMarkets.slice(0,4),signalMarkets:out.signalMarkets,signalSample:out.signalSample,engineBlocks:out.engineBlocks.slice(0,18)}).slice(0,40000));
// Ingest only already-observed scheduled fixtures; never fetch or invent odds.
const id=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const keys=['BTTS_YES','BTTS_NO','1X2_HOME','1X2_DRAW','1X2_AWAY'];
function normalize(f,now){
 if(f?.status!=='scheduled'||!id(f.id)||!id(f.teams?.home?.id)||!id(f.teams?.away?.id)||String(f.teams.home.id)===String(f.teams.away.id)||!Number.isSafeInteger(f.kickoff_ts)||f.kickoff_ts<=now)return null;
 const o=f.storedBet365;let odds=null;
 if(o?.bookmaker==='bet365'&&Number.isSafeInteger(o.observed)&&o.observed>0&&o.observed<=now&&o.observed<f.kickoff_ts){
  const prices={};for(const k of keys){const p=o.prices?.[k];if(typeof p==='number'&&Number.isFinite(p)&&p>1)prices[k]=p}
  if(Object.keys(prices).length)odds={bookmaker:'bet365',observed:o.observed,prices};
 }
 const rawHub=f.storedHub1x2;let hub=null;
 if(rawHub?.bookmaker==='5usd-hub'&&Number.isSafeInteger(rawHub.observed)&&rawHub.observed>0&&rawHub.observed<=now&&rawHub.observed<f.kickoff_ts&&['1X2_HOME','1X2_DRAW','1X2_AWAY'].every(k=>typeof rawHub.prices?.[k]==='number'&&Number.isFinite(rawHub.prices[k])&&rawHub.prices[k]>1)){
  hub={bookmaker:'5usd-hub',observed:rawHub.observed,source:'NORMAL_HUB_CACHED_ODDS',prices:{'1X2_HOME':rawHub.prices['1X2_HOME'],'1X2_DRAW':rawHub.prices['1X2_DRAW'],'1X2_AWAY':rawHub.prices['1X2_AWAY']}};
 }
 return {id:String(f.id),status:'scheduled',kickoff_ts:f.kickoff_ts,...(id(f.league?.id)?{league:{id:Number(f.league.id),name:String(f.league.name||'')}}:{}),teams:{home:{id:Number(f.teams.home.id),name:f.teams.home.name},away:{id:Number(f.teams.away.id),name:f.teams.away.name}},...(odds?{storedBet365:odds}:{}),...(hub?{storedHub1x2:hub}:{})};
}
export function mergeStoredPrematch(existing,incoming,now){
 const map=new Map(),stats={received:incoming.length,accepted:0,rejected:0,conflicts:0,rescheduled:0};
 for(const f of existing){const n=normalize(f,now);if(n)map.set(n.id,n)}
 for(const f of incoming){const n=normalize(f,now);if(!n){stats.rejected++;continue}const prev=map.get(n.id);
 if(prev&&(prev.teams.home.id!==n.teams.home.id||prev.teams.away.id!==n.teams.away.id)){stats.conflicts++;continue}
  // The provider can revise kickoff for the SAME fixture/team IDs. That is
  // not a new selection and does not alter the immutable pick ledger.
  if(prev&&prev.kickoff_ts!==n.kickoff_ts)stats.rescheduled++;
 if(prev?.storedBet365&&(!n.storedBet365||prev.storedBet365.observed>n.storedBet365.observed))n.storedBet365=prev.storedBet365;
 if(prev?.storedHub1x2&&(!n.storedHub1x2||prev.storedHub1x2.observed>n.storedHub1x2.observed))n.storedHub1x2=prev.storedHub1x2;
 map.set(n.id,n);stats.accepted++}
 const fixtures=[...map.values()].sort((a,b)=>a.kickoff_ts-b.kickoff_ts||a.id.localeCompare(b.id));
 if(fixtures.length>1000)throw Error('PREMATCH_CAPACITY_EXCEEDED');
 return {fixtures,stats:{...stats,stored:fixtures.length,bttsPrices:fixtures.filter(f=>['BTTS_YES','BTTS_NO'].every(k=>f.storedBet365?.prices[k]>1)).length,oneX2Prices:fixtures.filter(f=>['1X2_HOME','1X2_DRAW','1X2_AWAY'].every(k=>(f.storedHub1x2??f.storedBet365)?.prices[k]>1)).length}};
}

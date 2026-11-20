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
 return {id:String(f.id),status:'scheduled',kickoff_ts:f.kickoff_ts,teams:{home:{id:Number(f.teams.home.id),name:f.teams.home.name},away:{id:Number(f.teams.away.id),name:f.teams.away.name}},...(odds?{storedBet365:odds}:{})};
}
export function mergeStoredPrematch(existing,incoming,now){
 const map=new Map(),stats={received:incoming.length,accepted:0,rejected:0,conflicts:0};
 for(const f of existing){const n=normalize(f,now);if(n)map.set(n.id,n)}
 for(const f of incoming){const n=normalize(f,now);if(!n){stats.rejected++;continue}const prev=map.get(n.id);
 if(prev&&(prev.kickoff_ts!==n.kickoff_ts||prev.teams.home.id!==n.teams.home.id||prev.teams.away.id!==n.teams.away.id)){stats.conflicts++;continue}
 if(prev?.storedBet365&&(!n.storedBet365||prev.storedBet365.observed>n.storedBet365.observed))n.storedBet365=prev.storedBet365;
 map.set(n.id,n);stats.accepted++}
 const fixtures=[...map.values()].sort((a,b)=>a.kickoff_ts-b.kickoff_ts||a.id.localeCompare(b.id));
 if(fixtures.length>1000)throw Error('PREMATCH_CAPACITY_EXCEEDED');
 return {fixtures,stats:{...stats,stored:fixtures.length,bttsPrices:fixtures.filter(f=>['BTTS_YES','BTTS_NO'].every(k=>f.storedBet365?.prices[k]>1)).length,oneX2Prices:fixtures.filter(f=>['1X2_HOME','1X2_DRAW','1X2_AWAY'].every(k=>f.storedBet365?.prices[k]>1)).length}};
}

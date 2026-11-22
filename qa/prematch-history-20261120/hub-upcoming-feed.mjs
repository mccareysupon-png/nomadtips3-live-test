// Convert ONLY the existing 5USD HUB cached scheduled fixtures into test Bot input.
// HUB fields are provider-level prices; do not misrepresent them as Bet365 quotes.
const positive=v=>/^[1-9]\d*$/.test(String(v??''))&&Number.isSafeInteger(Number(v));
const seconds=v=>{const n=Number(v);if(Number.isSafeInteger(n)&&n>1e12)return Math.floor(n/1000);if(Number.isSafeInteger(n)&&n>1e9)return n;const t=Date.parse(v);return Number.isFinite(t)?Math.floor(t/1000):0};
const price=v=>typeof v==='number'&&Number.isFinite(v)&&v>1;
export function scheduledFromNormalHub(snapshot,now,{max=1000,maxDays=3,earliestKickoffSec=300,maxPriceAgeSec=3600}={}){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_CLOCK');
 if(snapshot?.ok!==true||snapshot?.cacheOnly!==true||snapshot?.stale===true||!Array.isArray(snapshot?.fixtures))return {status:'DEFERRED_HUB_CACHE',fixtures:[],stats:{received:0,accepted:0,rejected:0,providerCalls:0}};
 const observed=seconds(snapshot.fetchedAt);
 if(observed<=0||observed>now+60||now-observed>3600)return {status:'DEFERRED_HUB_STALE',fixtures:[],stats:{received:0,accepted:0,rejected:0,providerCalls:0}};
 const rows=new Map(),stats={received:snapshot.fixtures.length,eligible:0,accepted:0,missingPrices:0,heldPrices:0,oldPrices:0,invalid:0,duplicates:0,providerCalls:0};
 for(const f of snapshot.fixtures){
  if(f?.status!=='scheduled'||f?.boardState!=='scheduled')continue;
  const start=seconds(f.kickoffUtc??f.kickoffAt);
  if(!positive(f.fixtureId)||!positive(f.home?.id)||!positive(f.away?.id)||!positive(f.league?.id)||String(f.home.id)===String(f.away.id)||start<now+earliestKickoffSec||start>now+maxDays*86400){stats.invalid++;continue}
  stats.eligible++;
  if(f.providerOddsHeld===true){stats.heldPrices++;continue}
  const odds=f.providerOdds?.odds?.['1x2']?.closing;
  if(![odds?.home,odds?.draw,odds?.away].every(price)){stats.missingPrices++;continue}
  const at=seconds(f.providerOddsFreshAt??f.providerOddsUpdatedAt);
  if(!at||at>now+60||now-at>maxPriceAgeSec||at>=start){stats.oldPrices++;continue}
  const id=String(f.fixtureId);
  if(rows.has(id)){stats.duplicates++;continue}
  rows.set(id,{id,status:'scheduled',kickoff_ts:start,league:{id:Number(f.league.id),name:String(f.league.name||'')},teams:{home:{id:Number(f.home.id),name:String(f.home.name??f.home.id)},away:{id:Number(f.away.id),name:String(f.away.name??f.away.id)}},storedHub1x2:{bookmaker:'5usd-hub',observed:at,source:'NORMAL_HUB_CACHED_ODDS',prices:{'1X2_HOME':odds.home,'1X2_DRAW':odds.draw,'1X2_AWAY':odds.away}}});
  if(rows.size>=max)break;
 }
 const fixtures=[...rows.values()].sort((a,b)=>a.kickoff_ts-b.kickoff_ts||a.id.localeCompare(b.id));
 stats.accepted=fixtures.length;
 return {status:'READY',fixtures,stats,source:'5DollarFootballAPI normal HUB /snapshot',providerCalls:0};
}

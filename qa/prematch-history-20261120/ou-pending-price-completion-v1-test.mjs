// BALL46 — TEST ONLY: complete the FIRST missing O/U 2.5 payout on already-issued
// but STILL PENDING pre-match predictions from existing Full Market CACHE.
// No upstream calls, no automatic 5USD reserve, no repricing, no changed picks.
// Late evidence is transparently marked, never presented as the issuance quote.
import {initOu,OU_MODEL} from './ou-math-v1-test.mjs';
import {initOuPricePickup} from './ou-price-pickup-v1-test.mjs';
const sql=(db,q,...p)=>Array.from(db.exec(q,...p));
const decimal=x=>typeof x==='number'&&Number.isFinite(x)&&x>1&&x<=1000;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const MAX_CACHE_AGE_MS=120000,MIN_PRE_KICKOFF_SEC=300,BATCH_SIZE=70;
const KNOWN_BOOKS=Object.freeze([
 'bet365','pinnacle','williamhill','ladbrokes','vcbet','1xbet','bwin',
 'easybets','interwetten','betfair','snai','macauslot','betsson',
 'betathome','18bet','10bet','12bet','coral','crown']);
export const OU_PENDING_PRICE_COMPLETION_POLICY=Object.freeze({
 mode:'CACHE_ONLY_FIRST_MISSING_PRICE_ONCE_TEST',
 markets:['goal_line_fixed','goal_line'],line:2.5,stage:['closing','opening'],
 noProviderCalls:true,minimumPreKickoffSec:MIN_PRE_KICKOFF_SEC,
 maxCacheAgeMs:MAX_CACHE_AGE_MS,onlyPendingWithoutPrice:true,
 neverChangeExistingPrice:true,keepOriginalPickAndTime:true,
 quoteAfterIssueMarkedAsLate:true,productionWrites:0
});
const normalized=s=>String(s??'').replace(/[\s_-]/g,'').toLowerCase();
const bookId=b=>{
 const slug=normalized(b?.slug),name=normalized(b?.name);
 return KNOWN_BOOKS.find(x=>normalized(x)===slug||normalized(x)===name)??null;
};
const priced=q=>q&&typeof q==='object'&&!Array.isArray(q)&&decimal(q.over)&&decimal(q.under);
function findQuote(odds){
 if(!odds||typeof odds!=='object'||Array.isArray(odds))return null;
 const ladder=odds.goal_line_fixed;
 if(ladder!==undefined&&ladder!==null){
  if(!Array.isArray(ladder)||ladder.length>50)return null;
  const hits=ladder.filter(x=>x&&typeof x==='object'&&Number(x.line)===2.5);
  if(hits.length>1)return null;
  const fixed=hits[0];
  if(fixed){
   if(priced(fixed.closing))return {over:fixed.closing.over,under:fixed.closing.under,stage:'closing',market:'goal_line_fixed'};
   if(priced(fixed.opening))return {over:fixed.opening.over,under:fixed.opening.under,stage:'opening',market:'goal_line_fixed'};
  }
 }
 const g=odds.goal_line;
 if(g&&typeof g==='object'&&!Array.isArray(g)){
  for(const stage of ['closing','opening']){
   const v=g[stage];
   if(v&&typeof v==='object'&&!Array.isArray(v)&&Number(v.line)===2.5&&priced(v))
    return {over:v.over,under:v.under,stage,market:'goal_line'};
  }
 }
 return null;
}
export function quoteForUnpricedPending(p,entry,now){
 if(!positive(p?.fixture_id)||!positive(p?.home_id)||!positive(p?.away_id)||
   p.home_id===p.away_id||p.status!=='PENDING'||p.price!==null||
   p.line!==2.5||p.model!==OU_MODEL||
   !['OVER_2.5','UNDER_2.5'].includes(p.pick)||
   !positive(p.kickoff)||p.kickoff<=now+MIN_PRE_KICKOFF_SEC||
   !positive(p.picked_at)||p.picked_at>now||
   !entry||entry.stale===true||!entry.fullOdds||typeof entry.fullOdds!=='object')return null;
 const fetchedAt=Number(entry.fetchedAt),ageMs=now*1000-fetchedAt;
 if(!Number.isFinite(fetchedAt)||fetchedAt<1e12||
  ageMs< -10000||ageMs>MAX_CACHE_AGE_MS||
  (entry.ageMs!=null&&(!Number.isFinite(entry.ageMs)||entry.ageMs<0||entry.ageMs>MAX_CACHE_AGE_MS))||
  fetchedAt/1000>=p.kickoff-MIN_PRE_KICKOFF_SEC)return null;
 const data=entry.fullOdds.data??entry.fullOdds;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 if(data.fixture_id!=null&&String(data.fixture_id)!==String(p.fixture_id))return null;
 const books=Array.isArray(data.bookmakers)?data.bookmakers:[];
 // Deterministic book choice, Bet365 preferred, then the declared Full Market
 // collection order. Do not average or infer from numeric goal lines.
 for(const name of KNOWN_BOOKS){
  const matches=books.filter(b=>bookId(b)===name);
  if(matches.length!==1)continue;
  const q=findQuote(matches[0].odds);
  if(!q)continue;
  const selected=p.pick==='OVER_2.5'?q.over:q.under;
  if(!decimal(selected))continue;
  return {fixtureId:p.fixture_id,homeId:p.home_id,awayId:p.away_id,
   pick:p.pick,line:2.5,bookmaker:name,
   kickoff:p.kickoff,originalPickedAt:p.picked_at,
   priceOver:q.over,priceUnder:q.under,selectedPrice:selected,
   source:'FULL_MARKET_LATE_FIRST_QUOTE_'+name.toUpperCase()+'_'+q.market.toUpperCase()+'_'+q.stage.toUpperCase(),
   stage:q.stage,market:q.market,observedAt:Math.floor(fetchedAt/1000),attachedAt:now,
   quoteTimeUnknown:q.stage==='opening',lateAttachment:true};
 }
 return null;
}
export function initPendingOuPriceCompletion(db){
 initOu(db);initOuPricePickup(db);
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_pending_price_completion_v1_test (fixture_id INTEGER PRIMARY KEY,picked_at INTEGER NOT NULL,source_observed_at INTEGER NOT NULL,attached_at INTEGER NOT NULL,bookmaker TEXT NOT NULL,market TEXT NOT NULL,stage TEXT NOT NULL,selected_price REAL NOT NULL,price_over REAL NOT NULL,price_under REAL NOT NULL,source TEXT NOT NULL)");
}
export function pendingUnpricedOuCandidates(db,now,limit=350){
 initPendingOuPriceCompletion(db);
 if(!positive(now)||!positive(limit)||limit>1000)throw Error('BAD_PENDING_QUOTE_SEARCH');
 return sql(db,"SELECT fixture_id,home_id,away_id,kickoff,picked_at,pick,line,model,status,price FROM b46_ou_pick_v1_test WHERE status='PENDING' AND price IS NULL AND line=2.5 AND model=? AND picked_at<=? AND kickoff>? ORDER BY kickoff,fixture_id LIMIT ?",
  OU_MODEL,now,now+MIN_PRE_KICKOFF_SEC,limit);
}
export function attachFirstPendingOuPrice(db,p,quote,now){
 initPendingOuPriceCompletion(db);
 if(!quote||!positive(now))return {state:'NO_VERIFIED_QUOTE'};
 let changed=false;
 db.transaction(()=>{
  const current=sql(db,"SELECT fixture_id,home_id,away_id,kickoff,picked_at,pick,line,model,status,price FROM b46_ou_pick_v1_test WHERE fixture_id=?",p.fixture_id)[0];
  if(!current||!quoteForUnpricedPending(current,{
   fullOdds:{fixture_id:current.fixture_id,bookmakers:[{
    slug:quote.bookmaker,odds:{goal_line_fixed:[{
     line:2.5,...(quote.market==='goal_line_fixed'?{
      [quote.stage]:{over:quote.priceOver,under:quote.priceUnder}}:{})}],
     ...(quote.market==='goal_line'?{goal_line:{[quote.stage]:{line:2.5,over:quote.priceOver,under:quote.priceUnder}}}:{})}}],
   fetchedAt:quote.observedAt*1000,ageMs:(now-quote.observedAt)*1000,stale:false
  },now))return;
  if(current.picked_at!==quote.originalPickedAt||
    quote.fixtureId!==current.fixture_id||quote.homeId!==current.home_id||
    quote.awayId!==current.away_id||quote.kickoff!==current.kickoff||
    quote.pick!==current.pick||quote.line!==2.5||quote.attachedAt!==now||
    !decimal(quote.selectedPrice)||!decimal(quote.priceOver)||!decimal(quote.priceUnder))return;
  // Preserve the original immutable pick and its picked_at. This is the FIRST
  // missing payout attachment, never a price revision of a settled bet.
  db.exec("INSERT INTO b46_ou_verified_quote_v1_test(fixture_id,home_id,away_id,pick,line,price_over,price_under,selected_price,observed_at,kickoff,source,bookmaker,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
   current.fixture_id,current.home_id,current.away_id,current.pick,2.5,
   quote.priceOver,quote.priceUnder,quote.selectedPrice,quote.observedAt,
   current.kickoff,quote.source,quote.bookmaker,OU_MODEL);
  if(Number(sql(db,"SELECT changes() AS n")[0]?.n??0)!==1)return;
  db.exec("UPDATE b46_ou_pick_v1_test SET price=? WHERE fixture_id=? AND status='PENDING' AND price IS NULL AND picked_at=? AND pick=? AND kickoff=? AND home_id=? AND away_id=? AND model=? AND line=2.5",
   quote.selectedPrice,current.fixture_id,current.picked_at,current.pick,current.kickoff,
   current.home_id,current.away_id,OU_MODEL);
  if(Number(sql(db,"SELECT changes() AS n")[0]?.n??0)!==1)
   throw Error('OU_PENDING_FIRST_PRICE_CAS_FAILED');
  db.exec("INSERT INTO b46_ou_pending_price_completion_v1_test(fixture_id,picked_at,source_observed_at,attached_at,bookmaker,market,stage,selected_price,price_over,price_under,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
   current.fixture_id,current.picked_at,quote.observedAt,now,quote.bookmaker,
   quote.market,quote.stage,quote.selectedPrice,quote.priceOver,quote.priceUnder,quote.source);
  changed=true;
 });
 return {state:changed?'ATTACHED_FIRST_VERIFIED_PRICE':'ALREADY_PRICED_OR_CHANGED',fixtureId:p.fixture_id};
}
export async function completePendingOuFromCachedMarket(db,{now,market}={}){
 if(!positive(now)||typeof market!=='function')throw Error('BAD_PENDING_PRICE_COMPLETION_INPUT');
 const candidates=pendingUnpricedOuCandidates(db,now,350);
 let examined=0,cached=0,attached=0,noOffer=0,failures=0;
 const attachedIds=[];
 for(let i=0;i<candidates.length;i+=BATCH_SIZE){
  const group=candidates.slice(i,i+BATCH_SIZE);
  let response=null;
  try{response=await market('/board-cache',{method:'POST',body:{fixtureIds:group.map(p=>String(p.fixture_id))}})}
  catch{failures+=group.length;continue}
  if(response?.ok!==true||response.externalRequestsAdded!==0||!response.entries||
     typeof response.entries!=='object'||Array.isArray(response.entries)){
    failures+=group.length;continue;
  }
  for(const p of group){
   examined++;const entry=response.entries[String(p.fixture_id)];
   if(entry)cached++;
   const q=quoteForUnpricedPending(p,entry,now);
   if(!q){noOffer++;continue}
   const outcome=attachFirstPendingOuPrice(db,p,q,now);
   if(outcome.state==='ATTACHED_FIRST_VERIFIED_PRICE'){attached++;attachedIds.push(p.fixture_id)}
  }
 }
 return {state:'CACHE_ONLY_PENDING_PRICE_COMPLETION',candidates:candidates.length,
  examined,cached,attached,noOffer,failures,attachedIds,
  providerCalls:0,noChangeToPickOrIssuedTime:true,noRepricing:true,
  latePriceEvidencePersisted:true,productionWrites:0};
}
export function pendingOuQuoteEvidence(db,limit=50){
 initPendingOuPriceCompletion(db);
 return sql(db,"SELECT fixture_id,picked_at,source_observed_at,attached_at,bookmaker,market,stage,selected_price,price_over,price_under,source FROM b46_ou_pending_price_completion_v1_test ORDER BY attached_at DESC,fixture_id DESC LIMIT ?",limit);
}

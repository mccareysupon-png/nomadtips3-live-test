// BALL46 TEST ONLY — O/U VALUE SCREEN V2.
// Analyze historical goals -> score / total distribution -> every offered
// verified O/U Asian line from existing Full Market cache -> decimal price >1.50
// AND 1-unit settlement EV >= +0.05 -> select one best priced side per fixture.
// Shadow/TEST ledger only. No predictions in legacy/production; no 5USD calls.
// Poisson shrinkage is a statistical model, NOT an AI-trained guarantee.
import {ouTargetLastMatches,ouTargetLeagueAsOf} from './ou-target-history-ft-v1-test.mjs';
import {estimateOu25,OU_POLICY} from './ou-math-v1-test.mjs';
const get=(db,q,...args)=>Array.from(db.exec(q,...args));
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const n=x=>typeof x==='number'&&Number.isFinite(x);
const isPrice=x=>n(x)&&x>1&&x<=1000;
const norm=x=>String(x??'').replace(/[\s_-]/g,'').toLowerCase();
const BOOKMAKERS=Object.freeze(['bet365','pinnacle','williamhill','ladbrokes','vcbet',
 '1xbet','bwin','easybets','interwetten','betfair','snai','macauslot','betsson',
 'betathome','18bet','10bet','12bet','coral','crown']);
export const OU_VALUE_V2_MODEL='ou-poisson-shrinkage-value-all-markets-v2-test';
export const OU_VALUE_V2_POLICY=Object.freeze({
 minimumPriceExclusive:1.50,minimumEV:0.05,
 allowMarkets:['goal_line_fixed','goal_line'],allowStage:['closing','opening'],
 targetEveryAvailableLine:true,asianQuarterFullAndHalf:true,
 minCombinedHistory:6,minHistoryPerTeam:3,
 maxHistoryPerTeam:OU_POLICY.maxHistory,
 maxLeagueHistory:120,maxCandidatesPerCycle:350,
 minSecondsBeforeKickoff:300,maxLookaheadSec:OU_POLICY.maxLookaheadSec,
 cacheMaxAgeMs:120000,maxCacheBatch:70,
 topSelectionsPerFixture:1,providerCalls:0,productionWrites:0,
 legacyOuV1Unchanged:true,legacy1x2Unchanged:true,
 shadowOnly:true,revision:'V2_VALUE_20261123'
});
export const validateLine=line=>n(line)&&line>=0&&line<=20&&
 Math.abs(line*4-Math.round(line*4))<1e-9;
// Unlike hardwired 2.5, Asian quarter stakes split exactly 50/50.
export function splitAsianLine(line){
 if(!validateLine(line))throw Error('INVALID_ASIAN_OU_LINE');
 const q=Math.round(line*4);
 if(q%2===0)return [line];
 return [(q-1)/4,(q+1)/4];
}
function singlePartPL(goals,line,side,price){
 const win=side==='OVER'?goals>line:goals<line;
 const push=goals===line;
 return push?0:win?price-1:-1;
}
export function profitForOuResult(goals,line,side,price){
 if(!Number.isSafeInteger(goals)||goals<0||!validateLine(line)||
   !['OVER','UNDER'].includes(side)||!isPrice(price))throw Error('INVALID_ASIAN_BET');
 const parts=splitAsianLine(line);
 return parts.reduce((v,l)=>v+singlePartPL(goals,l,side,price)/parts.length,0);
}
export function goalDistribution(lambda,maxGoals=45){
 if(!n(lambda)||lambda<=0||lambda>15||!Number.isSafeInteger(maxGoals)||maxGoals<30)
  throw Error('INVALID_POISSON_INPUT');
 const p=[Math.exp(-lambda)];
 for(let k=1;k<=maxGoals;k++)p[k]=p[k-1]*lambda/k;
 // Include entire supported high tail with normalization; bound error tiny.
 const sum=p.reduce((a,b)=>a+b,0);
 if(sum<0.999999999)throw Error('POISSON_TAIL_TRUNCATED');
 return p.map(v=>v/sum);
}
export function evaluateAsianOu(lambda,line,side,price){
 if(!validateLine(line)||!['OVER','UNDER'].includes(side)||!isPrice(price))
  throw Error('INVALID_OU_MARKET');
 const probs=goalDistribution(lambda);
 let ev=0,win=0,push=0,lose=0,halfWin=0,halfLoss=0;
 for(let goals=0;goals<probs.length;goals++){
  const gain=profitForOuResult(goals,line,side,price);
  ev+=probs[goals]*gain;
  if(Math.abs(gain)<1e-10)push+=probs[goals];
  else if(Math.abs(gain-(price-1))<1e-10)win+=probs[goals];
  else if(Math.abs(gain+1)<1e-10)lose+=probs[goals];
  else if(gain>0)halfWin+=probs[goals];
  else halfLoss+=probs[goals];
 }
 return {ev,win,push,lose,halfWin,halfLoss,modelExpectedGoals:lambda,
  settlement:'ASIAN_QUARTER_SPLIT_EXACT'};
}
export function topExactScores(lambdaHome,lambdaAway,count=5){
 if(!n(lambdaHome)||!n(lambdaAway)||lambdaHome<=0||lambdaAway<=0)
  throw Error('INVALID_SCORE_LAMBDAS');
 const h=goalDistribution(lambdaHome),a=goalDistribution(lambdaAway),rows=[];
 for(let home=0;home<=12;home++)for(let away=0;away<=12;away++)
  rows.push({score:home+'-'+away,probability:h[home]*a[away]});
 return rows.sort((x,y)=>y.probability-x.probability||x.score.localeCompare(y.score)).slice(0,count);
}
function namedBook(b){
 const slug=norm(b?.slug),name=norm(b?.name);
 return BOOKMAKERS.find(k=>norm(k)===slug||norm(k)===name)??null;
}
function bothPriced(v){
 return v&&typeof v==='object'&&!Array.isArray(v)&&isPrice(v.over)&&isPrice(v.under);
}
function stageQuotes(line,market,record,sourceName){
 const quotes=[];
 if(!validateLine(line)||!record||typeof record!=='object')return quotes;
 for(const stage of ['closing','opening']){
  const v=record[stage];
  if(!bothPriced(v))continue;
  if(v.line!=null&&Number(v.line)!==line)continue;
  quotes.push({line,over:v.over,under:v.under,stage,market:sourceName});
 }
 return quotes;
}
export function extractFullMarketOuOffers(entry,fixtureId,now,kickoff){
 if(!validId(fixtureId)||!Number.isSafeInteger(now)||
  !Number.isSafeInteger(kickoff)||kickoff<=now+OU_VALUE_V2_POLICY.minSecondsBeforeKickoff||
  !entry||entry.stale===true||!entry.fullOdds||typeof entry.fullOdds!=='object')
  return {status:'MISSING_OR_STALE_CACHE',offers:[]};
 const fetchedAt=Number(entry.fetchedAt),ageMs=now*1000-fetchedAt;
 if(!n(fetchedAt)||fetchedAt<1e12||ageMs<-10000||
  ageMs>OU_VALUE_V2_POLICY.cacheMaxAgeMs||
  (entry.ageMs!=null&&(!n(entry.ageMs)||entry.ageMs>OU_VALUE_V2_POLICY.cacheMaxAgeMs||entry.ageMs<0))||
  fetchedAt/1000>=kickoff-OU_VALUE_V2_POLICY.minSecondsBeforeKickoff)
  return {status:'MISSING_OR_STALE_CACHE',offers:[]};
 const data=entry.fullOdds.data??entry.fullOdds;
 if(!data||typeof data!=='object'||Array.isArray(data)||
  (data.fixture_id!=null&&String(data.fixture_id)!==String(fixtureId)))
  return {status:'FIXTURE_PAYLOAD_MISMATCH',offers:[]};
 const books=Array.isArray(data.bookmakers)?data.bookmakers:[];
 const offers=[];
 for(const name of BOOKMAKERS){
  const matches=books.filter(b=>namedBook(b)===name);
  if(matches.length!==1)continue;
  const odds=matches[0].odds;
  if(!odds||typeof odds!=='object'||Array.isArray(odds))continue;
  const candidates=[];
  const fixed=odds.goal_line_fixed;
  if(Array.isArray(fixed)&&fixed.length<=60){
   const seen=new Set(),dup=new Set();
   for(const item of fixed){
    if(!item||item.line===null||item.line===undefined||item.line===''||!validateLine(Number(item.line)))continue;
    const line=Number(item.line);
    if(seen.has(line)){dup.add(line);continue}
    seen.add(line);
   }
   for(const item of fixed){
    const line=item?.line==null||item.line===''?NaN:Number(item.line);
    if(!validateLine(line)||dup.has(line))continue;
    candidates.push(...stageQuotes(line,odds,item,'goal_line_fixed'));
   }
  }
  const main=odds.goal_line;
  if(main&&typeof main==='object'&&!Array.isArray(main)){
   for(const stage of ['closing','opening']){
    const v=main[stage];
    if(!v||v.line==null||v.line===''||!validateLine(Number(v.line))||!bothPriced(v))continue;
    candidates.push({line:Number(v.line),over:v.over,under:v.under,stage,market:'goal_line'});
   }
  }
  // For each bookmaker and each line, prefer closing to opening; fixed line
  // over moving main when both at same stage. NEVER use in-play or line marker.
  const ordered=candidates.sort((x,y)=>
   (x.stage==='closing'?0:1)-(y.stage==='closing'?0:1)||
   (x.market==='goal_line_fixed'?0:1)-(y.market==='goal_line_fixed'?0:1));
  const taken=new Set();
  for(const q of ordered){
   if(taken.has(q.line))continue;taken.add(q.line);
   offers.push({...q,bookmaker:name,fixtureId:Number(fixtureId),
    capturedAt:now,sourceObservedAt:Math.floor(fetchedAt/1000),
    providerQuoteTimestamp:null,stageHistoricalPossible:true,
    source:'FULL_MARKET_CACHE_'+q.market.toUpperCase()+'_'+q.stage.toUpperCase()});
  }
 }
 return {status:offers.length?'PRICED':'NO_VERIFIED_OU_OFFERS',offers};
}
function leaguePriorAsOf(db,leagueId,kickoff,asOf,cache){
 const key=leagueId+'/'+kickoff;
 if(cache.has(key))return cache.get(key);
 let history=[];
 if(validId(leagueId)){
  history=ouTargetLeagueAsOf(db,Number(leagueId),kickoff,asOf,120);
 }
 let home=1.38*20,away=1.15*20,total=20;
 for(const g of history)if(n(g.hg)&&n(g.ag)&&g.hg>=0&&g.ag>=0){
  home+=g.hg;away+=g.ag;total++;
 }
 const result={home:home/total,away:away/total,leagueHistory:history.length};
 cache.set(key,result);return result;
}
export function buildOuValueModels(db,fixtures,now,{maxFixtures=350}={}){
 if(!Array.isArray(fixtures)||!Number.isSafeInteger(now)||!Number.isSafeInteger(maxFixtures)||
  maxFixtures<1||maxFixtures>350)throw Error('INVALID_OU_VALUE_FEED');
 const seen=new Set(),leagueCache=new Map(),models=[];
 const counts={feedRows:fixtures.length,checked:0,invalid:0,insufficientHistory:0,modeled:0};
 for(const f of fixtures){
  if(counts.checked>=maxFixtures)break;
  const id=Number(f?.id),homeId=Number(f?.teams?.home?.id),awayId=Number(f?.teams?.away?.id),kickoff=f?.kickoff_ts;
  if(!validId(id)||!validId(homeId)||!validId(awayId)||homeId===awayId||
   seen.has(id)||f?.status!=='scheduled'||!Number.isSafeInteger(kickoff)||
   kickoff<=now+OU_VALUE_V2_POLICY.minSecondsBeforeKickoff||
   kickoff>now+OU_VALUE_V2_POLICY.maxLookaheadSec){counts.invalid++;continue}
  seen.add(id);counts.checked++;
  const home=ouTargetLastMatches(db,homeId,kickoff,now,OU_VALUE_V2_POLICY.maxHistoryPerTeam);
  const away=ouTargetLastMatches(db,awayId,kickoff,now,OU_VALUE_V2_POLICY.maxHistoryPerTeam);
  if(home.length<OU_VALUE_V2_POLICY.minHistoryPerTeam||
     away.length<OU_VALUE_V2_POLICY.minHistoryPerTeam){
   counts.insufficientHistory++;continue;
  }
  const prior=leaguePriorAsOf(db,f?.league?.id,kickoff,now,leagueCache);
  // Reuse tested team/venue/shrinkage lambdas but DO NOT filter by O/U 2.5
  // probability. Market line is supplied by bookmaker and can be ANY 0.25 step.
  const estimate=estimateOu25(home,away,prior);
  if(!n(estimate.lambdaHome)||!n(estimate.lambdaAway))continue;
  counts.modeled++;
  models.push({fixtureId:id,homeId,awayId,
   home:String(f.teams.home.name??homeId).slice(0,160),
   away:String(f.teams.away.name??awayId).slice(0,160),
   leagueId:validId(f?.league?.id)?Number(f.league.id):0,
   leagueName:String(f?.league?.name??'').slice(0,160),
   kickoff,lambdaHome:estimate.lambdaHome,lambdaAway:estimate.lambdaAway,
   expectedTotalGoals:estimate.expectedTotalGoals,model:OU_VALUE_V2_MODEL,
   homeHistory:home.length,awayHistory:away.length,
   leagueHistory:prior.leagueHistory,
   historyConfidence:home.length>=5&&away.length>=5?'NORMAL':'LOW_SAMPLE'});
 }
 return {models,counts};
}
function sortRank(a,b){
 return b.ev-a.ev||b.win-a.win||
  // When two bookies have almost equal EV, prefer more identifiable Bet365.
  Number(b.bookmaker==='bet365')-Number(a.bookmaker==='bet365')||
  a.line-b.line||a.side.localeCompare(b.side)||a.bookmaker.localeCompare(b.bookmaker);
}
export function chooseBestOuValue(model,offers,now){
 if(!model||!Array.isArray(offers)||!Number.isSafeInteger(now))throw Error('INVALID_VALUE_SELECTION');
 const evaluated=[],passing=[];
 for(const quote of offers){
  if(quote.fixtureId!==model.fixtureId||!validateLine(quote.line))continue;
  for(const side of ['OVER','UNDER']){
   const price=quote[side.toLowerCase()];
   if(!isPrice(price)||price<=OU_VALUE_V2_POLICY.minimumPriceExclusive)continue;
   const score=evaluateAsianOu(model.expectedTotalGoals,quote.line,side,price);
   const v={fixtureId:model.fixtureId,homeId:model.homeId,awayId:model.awayId,
    home:model.home,away:model.away,leagueId:model.leagueId,leagueName:model.leagueName,
    kickoff:model.kickoff,pickedAt:now,market:'O/U',pick:side,
    side,line:quote.line,price,bookmaker:quote.bookmaker,
    source:quote.source,priceStage:quote.stage,capturedAt:now,
    sourceObservedAt:quote.sourceObservedAt,providerQuoteTimestamp:null,
    model:OU_VALUE_V2_MODEL,expectedTotalGoals:model.expectedTotalGoals,
    lambdaHome:model.lambdaHome,lambdaAway:model.lambdaAway,
    homeHistory:model.homeHistory,awayHistory:model.awayHistory,
    leagueHistory:model.leagueHistory,historyConfidence:model.historyConfidence,
    ev:score.ev,probabilityFullWin:score.win,probabilityPush:score.push,
    probabilityFullLoss:score.lose,probabilityHalfWin:score.halfWin,
    probabilityHalfLoss:score.halfLoss,probability:score.win+score.halfWin,
    asianSettlement:true,stageHistoricalPossible:true};
   evaluated.push(v);
   if(v.ev>=OU_VALUE_V2_POLICY.minimumEV-1e-12)passing.push(v);
  }
 }
 passing.sort(sortRank);
 const selected=passing[0]??null;
 if(selected)selected.topScores=topExactScores(model.lambdaHome,model.lambdaAway);
 return {selected,passed:passing.length,evaluated:evaluated.length,
  rejectedEV:evaluated.length-passing.length};
}
export async function screenOuValueV2(db,{fixtures,now,market}={}){
 if(!Number.isSafeInteger(now)||!Array.isArray(fixtures)||typeof market!=='function')
  throw Error('INVALID_OU_VALUE_SCREEN_ARGUMENTS');
 const {models,counts}=buildOuValueModels(db,fixtures,now);
 const found=[],out={mode:'O_U_ALL_MARKET_VALUE_SCREEN_V2_TEST_SHADOW',
  policy:OU_VALUE_V2_POLICY,model:OU_VALUE_V2_MODEL,
  ...counts,cached:0,unavailable:0,pricedFixtures:0,offers:0,
  evaluatedSelections:0,passedSelections:0,qualified:0,
  selected:found,providerCalls:0,paidRequests:0,
  existingPredictionsUnchanged:true,productionWrites:0};
 for(let i=0;i<models.length;i+=OU_VALUE_V2_POLICY.maxCacheBatch){
  const group=models.slice(i,i+OU_VALUE_V2_POLICY.maxCacheBatch);
  let reply=null;
  try{
   reply=await market('/board-cache',{method:'POST',body:{fixtureIds:group.map(p=>String(p.fixtureId))}});
  }catch{out.unavailable+=group.length;continue}
  if(reply?.ok!==true||reply.externalRequestsAdded!==0||
   !reply.entries||typeof reply.entries!=='object'||Array.isArray(reply.entries)){
   out.unavailable+=group.length;continue;
  }
  for(const p of group){
   const entry=reply.entries[String(p.fixtureId)]??null;
   if(entry)out.cached++;
   const {offers}=extractFullMarketOuOffers(entry,p.fixtureId,now,p.kickoff);
   if(!offers.length){out.unavailable++;continue}
   out.pricedFixtures++;out.offers+=offers.length;
   const evaluation=chooseBestOuValue(p,offers,now);
   out.evaluatedSelections+=evaluation.evaluated;
   out.passedSelections+=evaluation.passed;
   if(evaluation.selected){out.qualified++;found.push(evaluation.selected)}
  }
 }
 return out;
}
// Keep shadow selections independently immutable from legacy O/U 2.5 ledger.
export function initOuValueShadow(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_value_v2_shadow_test (fixture_id INTEGER PRIMARY KEY,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,picked_at INTEGER NOT NULL,pick TEXT NOT NULL,line REAL NOT NULL,price REAL NOT NULL,bookmaker TEXT NOT NULL,source TEXT NOT NULL,source_observed_at INTEGER NOT NULL,model TEXT NOT NULL,lambda_home REAL NOT NULL,lambda_away REAL NOT NULL,expected_goals REAL NOT NULL,ev REAL NOT NULL,home_history INTEGER NOT NULL,away_history INTEGER NOT NULL,history_confidence TEXT NOT NULL)");
 db.exec('CREATE INDEX IF NOT EXISTS b46_ou_value_v2_shadow_picktime ON b46_ou_value_v2_shadow_test(picked_at DESC)');
}
export function recordOuValueShadow(db,selected,now){
 if(!Array.isArray(selected)||!Number.isSafeInteger(now))throw Error('BAD_VALUE_SHADOW_INPUT');
 initOuValueShadow(db);
 let added=0,duplicate=0,rejected=0;
 db.transaction(()=>{
  for(const p of selected){
   if(!validId(p.fixtureId)||!validId(p.homeId)||!validId(p.awayId)||
    p.homeId===p.awayId||!['OVER','UNDER'].includes(p.side)||
    p.pick!==p.side||!validateLine(p.line)||!isPrice(p.price)||
    p.price<=OU_VALUE_V2_POLICY.minimumPriceExclusive||
    !n(p.ev)||p.ev<OU_VALUE_V2_POLICY.minimumEV-1e-12||
    p.pickedAt!==now||p.kickoff<=now+OU_VALUE_V2_POLICY.minSecondsBeforeKickoff||
    !BOOKMAKERS.includes(p.bookmaker)||!n(p.sourceObservedAt)||
    now-p.sourceObservedAt>OU_VALUE_V2_POLICY.cacheMaxAgeMs/1000||
    p.sourceObservedAt>now+10||
    p.sourceObservedAt>=p.kickoff-OU_VALUE_V2_POLICY.minSecondsBeforeKickoff||
    p.model!==OU_VALUE_V2_MODEL){rejected++;continue}
   db.exec("INSERT INTO b46_ou_value_v2_shadow_test(fixture_id,home_id,away_id,kickoff,picked_at,pick,line,price,bookmaker,source,source_observed_at,model,lambda_home,lambda_away,expected_goals,ev,home_history,away_history,history_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
    p.fixtureId,p.homeId,p.awayId,p.kickoff,p.pickedAt,p.side,p.line,p.price,
    p.bookmaker,p.source,p.sourceObservedAt,p.model,p.lambdaHome,p.lambdaAway,
    p.expectedTotalGoals,p.ev,p.homeHistory,p.awayHistory,p.historyConfidence);
   const changed=Number(get(db,'SELECT changes() AS n')[0]?.n??0);
   if(changed===1)added++;else duplicate++;
  }
 });
 return {added,duplicate,rejected,model:OU_VALUE_V2_MODEL,
  oldPredictionLedgerChanged:false,providerCalls:0,immutable:true};
}
export function readOuValueShadow(db,limit=50){
 initOuValueShadow(db);
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('BAD_VALUE_SHADOW_LIMIT');
 return get(db,'SELECT * FROM b46_ou_value_v2_shadow_test ORDER BY picked_at DESC,fixture_id DESC LIMIT ?',limit);
}

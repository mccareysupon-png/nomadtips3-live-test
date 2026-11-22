import {DurableObject} from 'cloudflare:workers';
import {init,ingest,normalize,totals,coverage,dailyPlan,pathFor} from './history.mjs';
import {mergeStoredPrematch} from './stored-prematch-feed.mjs';
import {dryRunStored,BASELINE_SHADOW,ACCUMULATION_SHADOW,TRIAL_SHADOW,MARKET_SHADOW} from './stored-signal-adapter.mjs';
import {initPickLedger,recordPicks,settlePicks,ledger,picksFromBot} from './test-pick-ledger.mjs';
import {matchNormalHub} from './normal-hub-monitor.mjs';
import {leagueNameRegistryFromFixtures,enrichLeagueNamesOnMonitor,leagueCatalogFromCachedHub,restoreLeagueNamesFromOriginalRows} from './league-name-cache.mjs';
import {preMatchDailyBook} from './london-cutoff.mjs';
import {initHistoryRounds,historyRoundState,importHistoryRoundFromCache} from './history-five-rounds.mjs';
import {historyCargoReport} from './history-cargo-registry.mjs';
import {historyFullCargoReport} from './history-cargo-full-payload.mjs';
import {scheduledFromNormalHub} from './hub-upcoming-feed.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
import {evaluateBttsUltra,mergeBet365BttsQuotes,parseBet365BttsOdds} from './btts-ultra-shadow.mjs';
import {bttsTestHtml} from './btts-human-web.mjs';
import {initBttsHistory,importBttsFinished,importBttsTeamFallback,bttsHistoryCoverage,candidateBttsLeagues} from './btts-history-private.mjs';
import {initBttsPickLedger,bttsPicksFromScreen,recordBttsPicks,settleBttsPicks,bttsPickLedger,combinedPrematchLedgers,marketDailyBooks,bttsDailySeries} from './btts-pick-ledger-test.mjs';
import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';
const AUTO_PROFILE_VERSION='auto-shadow-market-1x2-v1';
const json=x=>Response.json(x,{headers:{'cache-control':'no-store'}});
// Only attribute a finished result's league ID to the exact locked fixture and teams.
const archivedLeagueIdsForPicks=db=>{
 const rows=Array.from(db.exec("SELECT p.fixture_id,r.league_id FROM test_pick_1x2 p JOIN result_version r ON r.fixture_id=p.fixture_id AND r.home_id=p.home_id AND r.away_id=p.away_id WHERE r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=p.fixture_id AND v.home_id=p.home_id AND v.away_id=p.away_id)"));
 return Object.fromEntries(rows.filter(r=>Number.isSafeInteger(r.league_id)&&r.league_id>0).map(r=>[String(r.fixture_id),r.league_id]));
};
export class PrematchStore extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};this.missionInFlight=null;init(this.db);initPickLedger(this.db);initHistoryRounds(this.db);initBttsHistory(this.db);initBttsPickLedger(this.db);initPreMarketStatsRegistry(this.db)}
 async recordQualifiedBtts(now,providedFixtures=null,providedQuotes=null){
  // Local BTTS-only screen. Select only fixtures with actual Bet365 BTTS
  // quote evidence; ZERO new provider/HUB calls, no changes to 1X2/HCR.
  const fixtures=providedFixtures??await this.ctx.storage.get('botFixtures')??[];
  const saved=providedQuotes??await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};
  const priced=fixtures.filter(f=>{
   if(f?.status!=='scheduled'||!Number.isSafeInteger(f.kickoff_ts)||f.kickoff_ts<=now)return false;
   const q=saved[String(f.id)],direct=f.storedBet365;
   return (q?.state==='PRICED'||(direct?.bookmaker==='bet365'&&
    Number.isFinite(direct?.prices?.BTTS_YES)&&Number.isFinite(direct?.prices?.BTTS_NO)));
  });
  if(!priced.length)return {checked:0,qualified:0,added:0,duplicate:0,rejected:0,published:0,providerCalls:0};
  const result=evaluateBttsUltra(this.db,priced,now,saved,1000);
  const picks=bttsPicksFromScreen(result,priced,now);
  const recorded=recordBttsPicks(this.db,picks,now);
  return {checked:result.totals.upcoming,qualified:result.totals.qualified,...recorded,
   published:0,providerCalls:0};
 }
 async rememberLeagueCatalog(snapshot){
  const previous=await this.ctx.storage.get('prematchLeagueCatalogV1')??{};
  const storedFixtures=await this.ctx.storage.get('botFixtures')??[];
  const {catalog,conflicts}=leagueCatalogFromCachedHub(previous,snapshot,storedFixtures);
  if(JSON.stringify(previous)!==JSON.stringify(catalog))
   await this.ctx.storage.put('prematchLeagueCatalogV1',catalog);
  if(conflicts.length)console.log('PREMATCH_LEAGUE_ID_CONFLICTS '+conflicts.length);
  return catalog;
 }
 async syncNormalHub(now,force=false,withHistory=false,providedSnapshot=null){
  const stored=await this.ctx.storage.get('normalHubState');
  if(!force&&stored&&now-stored.checkedAt<20)return stored;
  if(!this.env.HUB)return stored??{source:'NOMAD_343_HUB_CACHED_SNAPSHOT',error:'READ_ONLY_HUB_BINDING_MISSING',monitor:{},providerCalls:0};
  try{
   let snapshot=providedSnapshot;
   if(!snapshot){const response=await this.env.HUB.fetch('https://hub.internal/snapshot',{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('CACHED_HUB_HTTP_'+response.status);
   snapshot=await response.json()}
   const parsed=matchNormalHub(snapshot,ledger(this.db).rows,now);
   await this.rememberLeagueCatalog(snapshot);
   const imported=parsed.finals.length?ingest(this.db,parsed.finals,parsed.observed):{added:0,duplicate:0,corrected:0,rejected:0};
   const settled=await this.ctx.storage.get('testLedgerEnabled')?settlePicks(this.db,now):0;
   const bttsSettled=settleBttsPicks(this.db,now);
   if(settled||bttsSettled)syncPreMarketStatsRegistry(this.db,now);
   const historyRound=withHistory?importHistoryRoundFromCache(this.db,snapshot,now):historyRoundState(this.db,now);
   const next={...parsed,finals:undefined,checkedAt:now,imported,settled,bttsSettled,historyRound};
   await this.ctx.storage.put('normalHubState',next);
   return next;
  }catch(e){
   console.log('PREMATCH_CACHE_ONLY_HUB_READ_FAILED',String(e.message).slice(0,180));
   const next={...(stored??{source:'NOMAD_343_HUB_CACHED_SNAPSHOT',monitor:{},providerCalls:0}),error:String(e.message).slice(0,120),snapshotStale:true,checkedAt:now};
   await this.ctx.storage.put('normalHubState',next);return next;
  }
 }


 async runDailyMission(now){
  const window=londonAccountingWindow(now);
  const current=await this.ctx.storage.get('dailyMission')??null;
  const history=historyRoundState(this.db,now);
  if(current?.day!==window.businessDay&&now-window.begin>7200){
   return {state:'AWAIT_NEXT_CUTOFF',day:window.businessDay,nextCutoffAt:window.end,history,extraProviderCalls:0};
  }
  if(!this.env.HUB)return {state:'HUB_READ_ONLY_BINDING_MISSING',day:window.businessDay,history,extraProviderCalls:0};
  let snapshot;
  try{
   const response=await this.env.HUB.fetch('https://hub.internal/snapshot',{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('CACHED_HUB_HTTP_'+response.status);
   snapshot=await response.json();
  }catch(e){return {state:'RETRY_NORMAL_HUB',day:window.businessDay,error:String(e.message).slice(0,120),history,extraProviderCalls:0}}
  // Capture ALL provider league names already present in cached HUB data,
  // including scheduled fixtures without eligible 1X2 odds.
  await this.rememberLeagueCatalog(snapshot);
  const feed=scheduledFromNormalHub(snapshot,now);
  if(feed.status!=='READY')return {state:feed.status,day:window.businessDay,history,feed:feed.stats,extraProviderCalls:0};
  const roundResults=[];
  if(history.completed<5)for(let roundNo=1;roundNo<=5;roundNo++){
   const round=importHistoryRoundFromCache(this.db,snapshot,now,{roundNo});
   roundResults.push({roundNo,state:round.state,imported:round.current?.imported??0});
   if(!['COMPLETED','ALREADY_EXECUTED'].includes(round.state)){
    const out={state:'HISTORY_REVIEW_REQUIRED',day:window.businessDay,roundResults,history:historyRoundState(this.db,now),extraProviderCalls:0};
    await this.ctx.storage.put('dailyMission',{...out,day:window.businessDay,checkedAt:now});return out;
   }
  }
  const updatedHistory=historyRoundState(this.db,now);
  if(updatedHistory.completed!==5)return {state:'HISTORY_INCOMPLETE',day:window.businessDay,history:updatedHistory,roundResults,extraProviderCalls:0};
  let merged;
  try{
   merged=mergeStoredPrematch(await this.ctx.storage.get('botFixtures')??[],feed.fixtures,now);
   if(feed.fixtures.length&&merged.stats.accepted===0)throw Error('NO_VALID_HUB_CANDIDATES');
  }catch(e){
   const out={state:'HISTORY_DELIVERED_FEED_REVIEW',day:window.businessDay,error:String(e.message).slice(0,100),history:updatedHistory,roundResults,extraProviderCalls:0};
   await this.ctx.storage.put('dailyMission',{...out,checkedAt:now});return out;
  }
  await this.ctx.storage.put('botFixtures',merged.fixtures);
  await this.ctx.storage.put('botFeedState',{at:now,source:'NORMAL_HUB_SNAPSHOT_AUTOMATIC',stats:merged.stats,rawStats:feed.stats,providerCalls:0});
  await this.syncNormalHub(now,true,false,snapshot);
  const out={state:'HISTORY_DELIVERED_BOT_READY',day:window.businessDay,checkedAt:now,history:updatedHistory,roundResults,feed:{...feed.stats,stored:merged.stats.stored,readyFor1X2:merged.stats.oneX2Prices},extraProviderCalls:0,botWillRun:true};
  await this.ctx.storage.put('dailyMission',out);
  return out;
 }

 async fetch(req){
 const path=new URL(req.url).pathname,now=Math.floor(Date.now()/1000);
 if(path==='/btts-preview-data'&&req.method==='GET'){
  // Public TEST viewing metadata ONLY. No owner secrets, odds raw payload,
  // bet provider fetch, ledger writes, or prediction publication.
  const params=new URL(req.url).searchParams;
  const fixtures=await this.ctx.storage.get('botFixtures')??[];
  const quotes=await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};
  const btts=evaluateBttsUltra(this.db,fixtures,now,quotes,250,{
   page:params.get('page'),q:params.get('q'),filter:params.get('filter')
  });
  return json({system:'BALL46_PREMATCH_TEST',mode:btts.mode,
   policy:{historyPerTeam:btts.policy.historyPerTeam,publish:false},totals:btts.totals,
   preview:btts.preview,providerCalls:0,published:0});
 }
 if(path==='/preview-data'&&req.method==='GET'){
 const testMonitor=await this.syncNormalHub(now);
 const ledgerNow=ledger(this.db);
 const registry=readPreMarketStatsRegistry(this.db,now);
 const bttsRaw=bttsPickLedger(this.db);
 const bttsLedgerNow={...bttsRaw,stats:registry.markets.BTTS};
 const allRaw=combinedPrematchLedgers(ledgerNow,bttsRaw);
 const allLedgerNow={...allRaw,stats:registry.markets.TOTAL};
 const dailyMarkets={oneX2:registry.dailyBooks['1X2'],
  btts:registry.dailyBooks.BTTS,all:registry.dailyBooks.TOTAL};
 const knownLeagueNames=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
 const knownFixtures=await this.ctx.storage.get('botFixtures')??[];
 const catalog=await this.ctx.storage.get('prematchLeagueCatalogV1')??{};
 const displayMonitor=enrichLeagueNamesOnMonitor(testMonitor,ledgerNow.rows,knownFixtures,knownLeagueNames,catalog,archivedLeagueIdsForPicks(this.db));
 const rows=Array.from(this.db.exec("SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT 50"));
 const allTeams=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), team_rows AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest) SELECT team,COUNT(*) AS matches FROM team_rows GROUP BY team"));
 const saved=await this.ctx.storage.get('previewSelections');
 return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),teams:allTeams.length,teamsWith10:allTeams.filter(n=>n.matches>=10).length,results:rows,selection:saved??null,testLedger:ledgerNow,bttsLedger:bttsLedgerNow,allLedger:allLedgerNow,marketDailyBooks:dailyMarkets,
  statsRegistry:{code:registry.code,mode:registry.mode,registryEvents:registry.registryEvents,rangeDays:registry.rangeDays},
  bttsDailySeries:registry.dailySeries.BTTS,allDailySeries:registry.dailySeries.TOTAL,
  dailyBook:preMatchDailyBook(this.db,now),historyRounds:historyRoundState(this.db,now),testMonitor:displayMonitor});
 }
 if(path==='/merge-archive'&&req.method==='POST'){
 const j=await req.json();if(!Array.isArray(j.rows)||j.rows.length>2000)return new Response('Invalid archive',{status:400});
 const stats={added:0,duplicate:0,conflict:0};const ids=new Set();
 for(const r of j.rows){if(![r.fixture_id,r.observed,r.league_id,r.kickoff,r.home_id,r.away_id].every(x=>Number.isSafeInteger(x)&&x>0)||r.home_id===r.away_id||r.status!=='finished'||r.kickoff>=r.observed||r.observed>now||![r.hg,r.ag].every(x=>Number.isSafeInteger(x)&&x>=0)||ids.has(r.fixture_id))return new Response('Invalid source row',{status:400});ids.add(r.fixture_id)}
 this.db.transaction(()=>{for(const r of j.rows){const old=Array.from(this.db.exec('SELECT * FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',r.fixture_id))[0];if(old){if(['league_id','kickoff','home_id','away_id','status','hg','ag'].every(k=>old[k]===r[k]))stats.duplicate++;else stats.conflict++;continue}this.db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',r.fixture_id,r.observed,r.league_id,r.kickoff,r.home_id,r.away_id,r.status,r.hg,r.ag);stats.added++}});
 const settled=await this.ctx.storage.get('testLedgerEnabled')?settlePicks(this.db,now):0;return json({stats,settled,stored:totals(this.db),providerCalls:0})}
 if(path==='/merge-summary'&&req.method==='GET'){const rows=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), tr AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest), tc AS (SELECT team,COUNT(*) AS n FROM tr GROUP BY team) SELECT n,COUNT(*) AS teams FROM tc GROUP BY n ORDER BY n"));return json({stored:totals(this.db),distribution:rows,teams:rows.reduce((s,r)=>s+r.teams,0),teamsWith10:rows.filter(r=>r.n>=10).reduce((s,r)=>s+r.teams,0)})}
 if((path==='/shadow-compare'||path==='/dry-run'&&new URL(req.url).searchParams.get('compare')==='1')&&req.method==='GET'){
 const fixtures=await this.ctx.storage.get('botFixtures')??[];
 const prefix="WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), tr AS (SELECT home_id AS team,league_id FROM latest UNION ALL SELECT away_id AS team,league_id FROM latest), tc AS (SELECT team,COUNT(*) AS n FROM tr GROUP BY team) ";
 const distribution=Array.from(this.db.exec(prefix+"SELECT n,COUNT(*) AS teams FROM tc GROUP BY n ORDER BY n"));
 const leagues=Array.from(this.db.exec(prefix+"SELECT league_id,COUNT(*) AS fixtures FROM latest GROUP BY league_id ORDER BY fixtures DESC,league_id"));
 const most=Array.from(this.db.exec(prefix+"SELECT tc.team,tc.n,tr.league_id,COUNT(*) AS league_matches FROM tc JOIN tr ON tr.team=tc.team WHERE tc.n=(SELECT MAX(n) FROM tc) AND tc.n>1 GROUP BY tc.team,tc.n,tr.league_id ORDER BY tc.team,tr.league_id LIMIT 100"));
 return json({mode:'SHADOW_CONFIG_COMPARISON_V1',stored:totals(this.db),inputCount:fixtures.length,coverage:{distribution,maximum:distribution.at(-1)?.n??0,teamsWith3:distribution.filter(x=>x.n>=3).reduce((s,x)=>s+x.teams,0),teamsWith5:distribution.filter(x=>x.n>=5).reduce((s,x)=>s+x.teams,0),teamsWith10:distribution.filter(x=>x.n>=10).reduce((s,x)=>s+x.teams,0),leagueCount:leagues.length,topLeagues:leagues.slice(0,10),mostHistoricalTeams:most},baseline:dryRunStored(this.db,fixtures,now,10,BASELINE_SHADOW),accumulation:dryRunStored(this.db,fixtures,now,10,ACCUMULATION_SHADOW),trial:dryRunStored(this.db,fixtures,now,10,TRIAL_SHADOW),market:dryRunStored(this.db,fixtures,now,10,MARKET_SHADOW),storage:{fixtures:'Durable Object botFixtures',history:'SQLite result_version',odds:'botFixtures[].storedBet365',output:'read-only; no publication'},providerCalls:0,published:0})}
 if(path==='/dry-run'&&req.method==='GET'){const fixtures=await this.ctx.storage.get('botFixtures')??[];return json({stored:totals(this.db),inputCount:fixtures.length,...dryRunStored(this.db,fixtures,now,1000,MARKET_SHADOW)})}
 if(path==='/bot-state'&&req.method==='GET')return json({dailyBook:preMatchDailyBook(this.db,now),mission:await this.ctx.storage.get('dailyMission')??null,config:{...MARKET_SHADOW,enabled:false,bttsEnabled:true,oneX2Enabled:true,mode:'READ_ONLY_SHADOW',autoVersion:AUTO_PROFILE_VERSION},lastRun:await this.ctx.storage.get('botRun')??null,inputs:(await this.ctx.storage.get('botFixtures')??[]).length,feed:await this.ctx.storage.get('botFeedState')??null,networkCalls:0});
 if((path==='/bot-input'||path==='/select')&&req.method==='POST'){
 const j=await req.json();if(!Array.isArray(j.fixtures)||j.fixtures.length>1000)return new Response('Invalid fixtures',{status:400});
 const old=await this.ctx.storage.get('botFixtures')??[];let merged;try{merged=mergeStoredPrematch(old,j.fixtures,now)}catch(e){return json({error:String(e.message),stored:old.length})}
 if(j.fixtures.length&&merged.stats.accepted===0)return json({error:'NO_VALID_STORED_FIXTURES',stored:old.length,stats:merged.stats});
 if(j.fixtures.length){await this.ctx.storage.put('botFixtures',merged.fixtures);await this.ctx.storage.put('botFeedState',{at:now,source:path,stats:merged.stats,providerCalls:0})}
 const shadow=dryRunStored(this.db,merged.fixtures,now,1000,MARKET_SHADOW);return json({system:'BALL46_PREMATCH_ONLY',stored:merged.stats.stored,feed:merged.stats,rows:shadow.rows.map(x=>({...x,picks:[]})),counts:shadow.counts,probability:shadow.probability,diagnostics:shadow.diagnostics,published:0,ruleState:'READ_ONLY_SHADOW',networkCalls:0});
 }
 if(path==='/bot-switch'&&req.method==='POST')return new Response('Publication disabled in test shadow',{status:409});
 if(path==='/test-ledger'&&req.method==='GET'){
  const testMonitor=await this.syncNormalHub(now),savedLedger=ledger(this.db);
  const knownLeagueNames=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
  const knownFixtures=await this.ctx.storage.get('botFixtures')??[];
  return json({...savedLedger,dailyBook:preMatchDailyBook(this.db,now),historyRounds:historyRoundState(this.db,now),
    testMonitor:enrichLeagueNamesOnMonitor(testMonitor,savedLedger.rows,knownFixtures,knownLeagueNames,
      await this.ctx.storage.get('prematchLeagueCatalogV1')??{},archivedLeagueIdsForPicks(this.db))})
 }
 if(path==='/league-name-audit'&&req.method==='GET'){
  // Owner-only, read existing persisted data. No HUB or provider request.
  const picks=ledger(this.db).rows, fixtures=await this.ctx.storage.get('botFixtures')??[];
  const saved=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
  const catalog=await this.ctx.storage.get('prematchLeagueCatalogV1')??{};
  const archived=archivedLeagueIdsForPicks(this.db);
  const testMonitor=await this.ctx.storage.get('normalHubState')??{monitor:{}};
  const resolved=enrichLeagueNamesOnMonitor(testMonitor,picks,fixtures,saved,catalog,archived).monitor;
  const breakdown={};
  let named=0,missing=0,viaArchiveLeagueId=0;
  for(const pick of picks){
   const id=String(pick.fixture_id),phase=resolved[id]?.phase??'UNKNOWN',hasName=typeof resolved[id]?.leagueName==='string'&&!!resolved[id].leagueName.trim();
   const entry=breakdown[phase]??{total:0,named:0,missing:0};
   entry.total++;if(hasName){entry.named++;named++}else{entry.missing++;missing++}
   if(hasName&&archived[id])viaArchiveLeagueId++;
  }
  return json({code:'PREMATCH_LEAGUE_ID_CATALOG_V1',mode:'TEST_ONLY',ledgerRows:picks.length,named,missing,catalogLeagues:Object.keys(catalog).length,archivedLeagueIdMatches:viaArchiveLeagueId,phases:breakdown,providerCalls:0,productionWrites:0});
 }
 if(path==='/league-restore'&&req.method==='POST'){
  // Owner-only repair from already captured or explicitly authorized 5USD
  // original fixture rows. This route itself performs ZERO network requests.
  // It never edits the prediction ledger, FT results, HCR or bot formulas.
  const j=await req.json().catch(()=>null);
  if(!j||!Array.isArray(j.fixtures)||j.fixtures.length===0||j.fixtures.length>100||
     j.source!=='5USD_ORIGINAL_FIXTURES_VERIFIED')
   return new Response(JSON.stringify({error:'INVALID_LEAGUE_RESTORE_INPUT'}),{status:400,headers:{'content-type':'application/json'}});
  const entries=j.fixtures.map(f=>({
   fixtureId:f?.fixtureId,homeId:f?.homeId,awayId:f?.awayId,
   leagueId:f?.leagueId,leagueName:f?.leagueName
  }));
  const previous=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
  const repaired=restoreLeagueNamesFromOriginalRows(previous,ledger(this.db).rows,entries,archivedLeagueIdsForPicks(this.db));
  if(repaired.stats.invalid||repaired.stats.mismatch||repaired.stats.conflicts)
   return new Response(JSON.stringify({error:'RESTORE_IDENTITY_OR_NAME_CONFLICT',stats:repaired.stats}),
    {status:409,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(repaired.stats.restored)
   await this.ctx.storage.put('prematchLeagueNamesV1',repaired.registry);
  return json({code:'PREMATCH_LEAGUE_RESTORE_TEST_ONLY',...repaired.stats,providerCalls:0,ledgerChanged:false});
 }
 // Isolated BTTS shadow diagnostics. Owner only, no fetch, no publication.
 // 1X2 trial, immutable pick ledger, HCR, and shared HUB stay untouched.
 // Owner-only BTTS data source inspection. No provider calls, no other writes.
 if(path==='/btts-history-private-test'&&req.method==='GET'){
  const fixtures=await this.ctx.storage.get('botFixtures')??[];
  return json({mode:'BTTS_PRIVATE_HISTORY_TEST',archive:bttsHistoryCoverage(this.db),
   leagues:candidateBttsLeagues(fixtures),providerCalls:0,published:0});
 }
 // Accept verified Ultra finished rows strictly for the private BTTS table;
 // NEVER insert into HCR result_version, 1X2 ledger, stats or HUB.
 // Owner-only Ultra team-last10 fallback, only for the two teams in one
 // real scheduled BTTS test fixture, and only into BTTS-private FT cache.
 if(path==='/btts-team-fallback-test'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  const fixtures=await this.ctx.storage.get('botFixtures')??[];
  const fixture=fixtures.find(f=>String(f.id)===String(body?.fixtureId));
  if(body?.source!=='ULTRA_TEAM_LAST10_FALLBACK'||!fixture||fixture.status!=='scheduled'||
     fixture.kickoff_ts<=now||!Number.isSafeInteger(body?.observed)||
     body.observed>now||now-body.observed>1200||
     ![Number(fixture.teams.home.id),Number(fixture.teams.away.id)].includes(Number(body.teamId))||
     !Array.isArray(body.rows)||body.rows.length<1||body.rows.length>10)
   return new Response(JSON.stringify({error:'INVALID_BTTS_FALLBACK_EVIDENCE'}),{status:400,headers:{'content-type':'application/json'}});
  try{
   const stats=importBttsTeamFallback(this.db,body.rows,body.observed,{teamId:body.teamId});
   return json({mode:'BTTS_TEAM_LAST10_PRIVATE_TEST',fixtureId:String(fixture.id),
     teamId:String(body.teamId),stats,archive:bttsHistoryCoverage(this.db),
     providerCalls:0,oneX2Changed:false,HCRChanged:false,published:0});
  }catch(error){
   return new Response(JSON.stringify({error:String(error.message)}),{status:422,headers:{'content-type':'application/json'}});
  }
 }
 if(path==='/btts-history-import-test'&&req.method==='POST'){
  const body=await req.json().catch(()=>null);
  if(body?.source!=='ULTRA_FINISHED_LEAGUE_SEASON'||!Array.isArray(body.rows)||
     body.rows.length>100||!Number.isSafeInteger(body.observed)||
     body.observed>now||now-body.observed>1200)
   return new Response(JSON.stringify({error:'INVALID_BTTS_PRIVATE_IMPORT'}),{status:400,headers:{'content-type':'application/json'}});
  try{
   const stats=importBttsFinished(this.db,body.rows,body.observed,{leagueId:body.leagueId,season:body.season});
   return json({mode:'BTTS_PRIVATE_HISTORY_TEST',stats,archive:bttsHistoryCoverage(this.db),
    providerCalls:0,oneX2Changed:false,HCRChanged:false,published:0});
  }catch(error){
   return new Response(JSON.stringify({error:String(error.message)}),{status:422,headers:{'content-type':'application/json'}});
  }
 }
 // Dedicated historical statistics registry. Read Snapshot only on GET.
 // The write path compares changed source-ledger events; never edits either ledger.
 if(path==='/prematch-stats-registry-test'&&req.method==='GET'){
  const days=new URL(req.url).searchParams.get('days')==='30'?30:90;
  return json(readPreMarketStatsRegistry(this.db,now,{rangeDays:days}));
 }
 if(path==='/prematch-stats-registry-audit-test'&&req.method==='GET')
  return json(auditPreMarketStatsRegistry(this.db));
 if(path==='/prematch-stats-registry-sync-test'&&req.method==='POST'){
  const update=syncPreMarketStatsRegistry(this.db,now);
  return json({update,snapshot:readPreMarketStatsRegistry(this.db,now),
   audit:auditPreMarketStatsRegistry(this.db)});
 }
 // Test-only explicit local BTTS check, without any upstream request.
 if(path==='/btts-cycle-test'&&req.method==='POST'){
  const trial=await this.recordQualifiedBtts(now);
  const settled=settleBttsPicks(this.db,now);
  const registry=syncPreMarketStatsRegistry(this.db,now);
  return json({mode:'BTTS_ISSUANCE_TEST_ONLY',trial,settled,registry,ledger:bttsPickLedger(this.db).stats,
    providerCalls:0,oneX2Modified:false,published:0});
 }
 if(path==='/btts-shadow'&&req.method==='GET'){
  const fixtures=await this.ctx.storage.get('botFixtures')??[];
  const savedQuotes=await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};
  return json({...evaluateBttsUltra(this.db,fixtures,now,savedQuotes),
   inputs:fixtures.length,storedBet365QuoteRecords:Object.keys(savedQuotes).length,
   sourceNote:'Stored Bet365 BTTS only. No 5USD per-fixture requests in this route.'});
 }
 // Manual transfer of an ALREADY obtained /v1/fixtures/{id}/odds response.
 // This route must never call upstream and must not promote a null to a price.
 if(path==='/btts-quote-import-test'&&req.method==='POST'){
  const payload=await req.json().catch(()=>null);
  const wanted=String(payload?.fixtureId??'');
  const fixtures=await this.ctx.storage.get('botFixtures')??[];
  const f=fixtures.find(x=>String(x.id)===wanted);
  if(!f||!Number.isSafeInteger(payload?.observed)||payload.observed<=0||
     (payload?.response?.fixture_id!=null&&String(payload.response.fixture_id)!==wanted)||
     (payload?.response?.fixtureId!=null&&String(payload.response.fixtureId)!==wanted))
   return new Response(JSON.stringify({error:'INVALID_FIXTURE_EVIDENCE'}),{status:400,headers:{'content-type':'application/json'}});
  const parsed=parseBet365BttsOdds(payload.response,{
   fixtureId:f.id,homeId:f.teams.home.id,awayId:f.teams.away.id,
   observed:payload.observed,kickoff:f.kickoff_ts,now
  });
  if(!['PRICED','NOT_OFFERED'].includes(parsed.state))
   return new Response(JSON.stringify({error:parsed.state}),{status:422,headers:{'content-type':'application/json'}});
  const previous=await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};
  if(Object.keys(previous).length>1000)return new Response('TEST_BTTS_CAPACITY_LIMIT',{status:409});
  let updated;
  try{updated=mergeBet365BttsQuotes(previous,f,parsed,now)}
  catch(error){return new Response(JSON.stringify({error:String(error.message)}),{status:409,headers:{'content-type':'application/json'}})}
  if(JSON.stringify(updated.quotes)!==JSON.stringify(previous))
   await this.ctx.storage.put('prematchBttsBet365QuotesV1',updated.quotes);
  const issued=updated.state==='PRICED'?await this.recordQualifiedBtts(now,fixtures,updated.quotes):null;
  const registry=issued?.added?syncPreMarketStatsRegistry(this.db,now):null;
  return json({mode:'BET365_BTTS_TEST_ONLY',fixtureId:wanted,state:updated.state,issued,registry,
   sourceQuote:parsed.sourceQuote??null,providerCalls:0,published:0,
   oneX2LedgerChanged:false});
 }
 if(path==='/test-ledger-start'&&req.method==='POST'){
 const j=await req.json();const matches=await this.ctx.storage.get('botFixtures')??[];const map=new Map(matches.map(f=>[String(f.id),f]));
 if(!Array.isArray(j.picks)||j.picks.some(p=>{const f=map.get(String(p.id));return !f||f.kickoff_ts!==p.kickoff||Number(f.teams.home.id)!==Number(p.homeId)||Number(f.teams.away.id)!==Number(p.awayId)}))return new Response('Frozen evidence does not match stored fixtures',{status:400});
 const recorded=recordPicks(this.db,j.picks,now);if(recorded.rejected)return json({error:'INVALID_PICK',recorded});
 // Persist only a small metadata map for ALREADY RECORDED TEST picks;
 // this never changes the Ledger, odds, HCR archive, or settlement result.
 try{
  const existingNames=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
  const selectedNames=leagueNameRegistryFromFixtures(existingNames,ledger(this.db).rows,matches);
  if(JSON.stringify(selectedNames)!==JSON.stringify(existingNames))
   await this.ctx.storage.put('prematchLeagueNamesV1',selectedNames);
 }catch(error){console.log('PREMATCH_LEAGUE_DISPLAY_CACHE_WARNING',String(error?.message||error).slice(0,120))}
 await this.ctx.storage.put('testLedgerEnabled',true);const settled=settlePicks(this.db,now);return json({recorded,settled,...ledger(this.db)});
 }
 // Owner-only inventory: no HUB fetch, no provider call, no Ledger mutation.
 // The public /preview-data route deliberately never includes cargo records.
 if(path==='/history-cargo-registry'&&req.method==='GET'){
  const url=new URL(req.url),day=url.searchParams.get('day'),detail=url.searchParams.get('detail')!=='0';
  try{
   return json(historyCargoReport(this.db,now,{day,includeItems:detail,upcoming:await this.ctx.storage.get('botFixtures')??[]}));
  }catch(e){return new Response(JSON.stringify({error:'HCR_INVALID_REPORT_REQUEST'}),{status:400,headers:{'content-type':'application/json','cache-control':'no-store'}})}
 }
 // Owner-only full original cached cargo inspection. NEVER exposed via /preview-data.
 if(path==='/history-cargo-full'&&req.method==='GET'){
  const url=new URL(req.url),day=url.searchParams.get('day'),roundRaw=url.searchParams.get('round'),fixtureRaw=url.searchParams.get('fixture');
  const roundNo=roundRaw===null?null:Number(roundRaw),fixtureId=fixtureRaw===null?null:Number(fixtureRaw);
  const includeRaw=url.searchParams.get('detail')==='1';
  try{return json(historyFullCargoReport(this.db,{day,roundNo,fixtureId,includeRaw}))}
  catch(error){return new Response(JSON.stringify({error:'FULL_CARGO_BAD_QUERY'}),{status:400,headers:{'content-type':'application/json','cache-control':'no-store'}})}
 }
 if(path==='/history-round-state'&&req.method==='GET')return json(historyRoundState(this.db,now));
 if(path==='/monitor'&&req.method==='POST')return json({monitor:await this.syncNormalHub(now),ledger:ledger(this.db).stats,extraProviderCalls:0});
 if(path==='/daily-mission-state'&&req.method==='GET')return json({mission:await this.ctx.storage.get('dailyMission')??null,history:historyRoundState(this.db,now),feed:await this.ctx.storage.get('botFeedState')??null,bot:await this.ctx.storage.get('botRun')??null,extraProviderCalls:0});
 if(path==='/history-round-tick'&&req.method==='POST')return json({state:'MOVED_TO_LONDON_CUTOFF_MISSION',history:historyRoundState(this.db,now),extraProviderCalls:0});
 if(path==='/daily-mission'&&req.method==='POST'){
 if(!this.missionInFlight)this.missionInFlight=this.runDailyMission(now).finally(()=>{this.missionInFlight=null});
 return json(await this.missionInFlight);
 }
 if(path==='/bot-run'&&req.method==='POST'){
 const fixtures=await this.ctx.storage.get('botFixtures')??[];
 const report=dryRunStored(this.db,fixtures,now,1000,MARKET_SHADOW);
 const archiveTeams=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), team_rows AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest) SELECT team,COUNT(*) AS matches FROM team_rows GROUP BY team ORDER BY matches DESC,team"));
 const archiveCoverage={finished:Number(totals(this.db).finished??0),teams:archiveTeams.length,ready:archiveTeams.filter(x=>x.matches>=3).length,insufficient:archiveTeams.filter(x=>x.matches<3).length,maximum:archiveTeams[0]?.matches??0};
 const rows=report.rows.map(r=>({...r,picks:[]}));
 if(await this.ctx.storage.get('testLedgerEnabled')){
  recordPicks(this.db,picksFromBot(report,fixtures,now),now);
  settlePicks(this.db,now);
  try{
   const existingNames=await this.ctx.storage.get('prematchLeagueNamesV1')??{};
   const selectedNames=leagueNameRegistryFromFixtures(existingNames,ledger(this.db).rows,fixtures);
   if(JSON.stringify(selectedNames)!==JSON.stringify(existingNames))
    await this.ctx.storage.put('prematchLeagueNamesV1',selectedNames);
  }catch(error){console.log('PREMATCH_LEAGUE_DISPLAY_CACHE_WARNING',String(error?.message||error).slice(0,120))}
 }
 const monitorRun=await this.syncNormalHub(now);
 const bttsIssued=await this.recordQualifiedBtts(now,fixtures);
 const statsRegistry=syncPreMarketStatsRegistry(this.db,now);
 const dailyBook=preMatchDailyBook(this.db,now);
 const out={...report,rows,system:'BALL46_PREMATCH_ONLY',ruleState:'READ_ONLY_SHADOW',autoVersion:AUTO_PROFILE_VERSION,checkedAt:now,networkCalls:0,archiveCoverage,qualified:rows.filter(x=>x.btts.signal!=='NO_SIGNAL'||x.oneX2.signal!=='NO_SIGNAL').length,dailyBook,bttsIssued,statsRegistry};
 await this.ctx.storage.put('botRun',{checkedAt:now,inputs:fixtures.length,checked:report.counts.upcoming,archiveCoverage,complete:report.counts.historyComplete,qualified:out.qualified,networkCalls:0,mode:out.mode,profile:report.profile,counts:report.counts,outcomes:report.outcomes,probability:report.probability,diagnostics:report.diagnostics,autoVersion:AUTO_PROFILE_VERSION,published:0});await this.ctx.storage.put('previewSelections',out);return json(out)}
 if(path==='/daily-state'&&req.method==='GET')return json({stored:totals(this.db),daily:await this.ctx.storage.get('dailyImport')??null});
 if(path==='/daily-init'&&req.method==='POST'){
 const old=await this.ctx.storage.get('dailyImport');
 if(!old){const seed={cycle:'1795154400',state:'complete',source:'verified_import_run_44723780062',requests:2,accepted:113};const n=Number(totals(this.db).finished);if(n<113)return new Response('Missing verified import',{status:409});await this.ctx.storage.put('dailyImport',seed)}
 return json({daily:await this.ctx.storage.get('dailyImport'),stored:totals(this.db)})}
 if(path==='/daily-run'&&req.method==='POST')return new Response(JSON.stringify({state:'DISABLED_NO_ADDITIONAL_PROVIDER_RUNS',providerCalls:0}),{status:409,headers:{'content-type':'application/json'}});
 if(path==='/health')return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),liveBindings:0,hubReadOnly:true,cutoff:'06:00 Europe/London',dailyBook:preMatchDailyBook(this.db,now),historyRounds:historyRoundState(this.db,now),dailyMission:await this.ctx.storage.get('dailyMission')??null,providerCalls:0});
 if(path==='/import'&&req.method==='POST'){const j=await req.json();if(!Array.isArray(j.rows)||j.rows.length>100||j.rows.some(f=>normalize(f)?.status!=='finished'||f.kickoff_ts>=now))return new Response('Invalid rows',{status:400});const stats=ingest(this.db,j.rows,now);const settled=await this.ctx.storage.get('testLedgerEnabled')?settlePicks(this.db,now):0;const bttsSettled=settleBttsPicks(this.db,now);const statsRegistry=syncPreMarketStatsRegistry(this.db,now);return json({ok:true,stats,settled,bttsSettled,statsRegistry,stored:totals(this.db),providerCalls:0})}
 return new Response('Not found',{status:404})
 }}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BALL46 | Pre-Match Test</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1117;color:#e6edf3;font:15px system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:24px 16px}header{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #30363d;padding-bottom:20px}h1{font-size:23px;margin:0}h1 span{color:#30d17b}small{color:#9da9b6}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}.card,section{border:1px solid #30363d;border-radius:12px;background:#161b22;padding:16px}.card b{display:block;font-size:28px;margin-top:8px}section{margin:12px 0}h2{font-size:17px;margin-top:0}p{line-height:1.6;color:#aab6c3}.warn{color:#e9b75e}table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}th,td{padding:10px;border-bottom:1px solid #30363d}th{color:#aab6c3}.scroll{overflow:auto}button{background:#238636;color:white;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}footer{color:#aab6c3;margin-top:20px}</style><main><header><h1>ball<span>46</span> / Pre-Match</h1><small>ISOLATED TEST · <a href="/btts" style="color:#54d996;text-decoration:underline;font-weight:700">View BTTS test</a></small></header><div id="status">Loading stored data…</div><div class="cards" id="cards"></div><section><h2>Selection status</h2><div id="selection"></div></section><section><h2>1X2 · Experimental candidates</h2><p>Market-anchored probability · Not calibrated · Stored prices, not live quotes</p><div class="scroll"><table><thead><tr><th>Match</th><th>Outcome</th><th>Probability</th><th>Stored odds</th><th>Edge</th><th>EV</th><th>History H/A</th><th>Evidence</th></tr></thead><tbody id="market"></tbody></table></div></section><section><h2>Actual finished results · latest 50</h2><div class="scroll"><table><thead><tr><th>Fixture ID</th><th>Kickoff (UTC)</th><th>Home ID</th><th>FT</th><th>Away ID</th><th>League ID</th></tr></thead><tbody id="results"></tbody></table></div></section><button onclick="load()">Refresh data</button><footer>Read-only preview · No Live Engine binding · No provider request on page load</footer></main><script>
const el=id=>document.getElementById(id);function cell(tr,v){const td=document.createElement('td');td.textContent=v;tr.append(td)}
async function load(){try{const r=await fetch('/preview-data',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();el('status').textContent='Connected to independent Pre-Match archive';el('cards').replaceChildren();for(const [label,value] of [['Finished results',d.stored.finished||0],['Teams in archive',d.teams],['Teams with 10+',d.teamsWith10],['Published picks',d.selection?.published??0]]){const c=document.createElement('div');c.className='card';c.textContent=label;const b=document.createElement('b');b.textContent=value;c.append(b);el('cards').append(c)}el('selection').textContent=d.selection?'Candidates: '+d.selection.rows.length+' · '+d.selection.ruleState:'No upcoming fixtures submitted yet. Initial league backfill and selection rules are pending.';el('selection').className='warn';const rows=d.selection?.rows??[];const market=rows.filter(x=>x.oneX2?.signal!=='NO_SIGNAL'&&x.oneX2?.metrics?.method==='market-anchored-1x2-v1');el('selection').textContent=d.selection?'Evaluated: '+(d.selection.probability?.oneX2?.computed??0)+' · Probability passed: '+(d.selection.probability?.oneX2?.passed??0)+' · Experimental candidates: '+market.length:'No stored evaluation';el('market').replaceChildren();for(const x of market){const m=x.oneX2.metrics,s=m.sides.find(v=>v.signal===x.oneX2.signal);if(!s)continue;const tr=document.createElement('tr');for(const v of [x.home+' vs '+x.away,s.signal,(s.model*100).toFixed(2)+'%',s.price.toFixed(2),(s.edge*100).toFixed(2)+'%',(s.ev*100).toFixed(2)+'%',x.homeCount+'/'+x.awayCount,m.evidenceTier==='sparse'?'Low sample':'3+ each'])cell(tr,v);el('market').append(tr)}el('results').replaceChildren();for(const x of d.results){const tr=document.createElement('tr');for(const v of [x.fixture_id,new Date(x.kickoff*1000).toISOString().slice(0,16).replace('T',' '),x.home_id,x.hg+' : '+x.ag,x.away_id,x.league_id])cell(tr,v);el('results').append(tr)}}catch(e){el('status').textContent='Load failed: '+e.message}}load();
</script></html>`;
export default {async scheduled(event,env){if(event.cron!=='*/15 * * * *'){console.log('PREMATCH_EXTRA_PROVIDER_CYCLE_DISABLED');return}const stub=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));const h=await stub.fetch('https://prematch.internal/daily-mission',{method:'POST'});if(!h.ok){console.log('PREMATCH_DAILY_MISSION_ERROR '+h.status);return}const mission=await h.json();console.log('PREMATCH_DAILY_MISSION '+mission.state+' rounds='+(mission.history?.completed??0));if(mission.state==='HISTORY_DELIVERED_BOT_READY'){const r=await stub.fetch('https://prematch.internal/bot-run',{method:'POST'});console.log('PREMATCH_AUTOMATIC_BOT '+r.status)}else{const r=await stub.fetch('https://prematch.internal/monitor',{method:'POST'});console.log('PREMATCH_SETTLEMENT_MONITOR '+r.status)}const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status)},async fetch(req,env){const p=new URL(req.url).pathname;if(req.method==='GET'&&p==='/preview')return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});if(req.method==='GET'&&p==='/btts')return new Response(bttsTestHtml,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});if(req.method==='GET'&&(p==='/preview-data'||p==='/btts-preview-data'))return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req);if(!env.OWNER_SECRET||req.headers.get('Authorization')!=='Bearer '+env.OWNER_SECRET)return new Response('Not found',{status:404});return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req)}};

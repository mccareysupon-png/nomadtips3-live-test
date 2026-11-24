// B46_ADAPTIVE_OU_RESEARCH_V1 — isolated pre-match 42-formula fixture+formula ledger.
// No independent paid API. No mutations to 1X2 / BTTS / existing O/U settlement.
// All values priced from genuinely fresh Full Market, no fabricated prices.
// Each rule is a DIFFERENT 1u simulated research exposure; not a portfolio.
import {FORMULAS,ADAPTIVE_OU_ID,screenAdaptiveResearch} from './b46-adaptive-ou-patterns-v1-test.mjs';
import {extractFullMarketOuOffers} from './ou-value-screener-v2-test.mjs';
import {initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const sql=(db,q,...a)=>Array.from(db.exec(q,...a));
const whole=x=>Number.isSafeInteger(x)&&x>=0;
const dollars=x=>Math.round(x*100000000)/100000000;
const initialized=new WeakSet();
export function initAdaptiveOuLedger(db){
 if(initialized.has(db))return;
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_ou_research_v1_ledger_test(fixture_id INTEGER NOT NULL,formula_id TEXT NOT NULL,market TEXT NOT NULL,selection TEXT NOT NULL CHECK(selection IN ('OVER','UNDER')),home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,home TEXT NOT NULL,away TEXT NOT NULL,kickoff INTEGER NOT NULL,picked_at INTEGER NOT NULL,line REAL NOT NULL CHECK(line=2.5),odds REAL NOT NULL,bookmaker TEXT NOT NULL,odds_source TEXT NOT NULL,quote_observed_at INTEGER NOT NULL,history_used INTEGER NOT NULL,supporting_teams TEXT NOT NULL,history_evidence TEXT NOT NULL,formula_support INTEGER NOT NULL,opposite_research INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','WIN','LOSS')),hg INTEGER,ag INTEGER,settled_at INTEGER,result_observed_at INTEGER,result_source TEXT,net_units REAL,PRIMARY KEY(fixture_id,formula_id,market,selection))");
 db.exec("CREATE INDEX IF NOT EXISTS b46_adaptive_ou_research_v1_pending_idx ON b46_adaptive_ou_research_v1_ledger_test(status,kickoff)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_adaptive_ou_research_v1_formula_idx ON b46_adaptive_ou_research_v1_ledger_test(formula_id,selection)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_ou_research_v1_snapshot_test(formula_id TEXT NOT NULL,selection TEXT NOT NULL,total INTEGER NOT NULL DEFAULT 0,pending INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,sum_odds REAL NOT NULL DEFAULT 0,total_units REAL NOT NULL DEFAULT 0,settled_units REAL NOT NULL DEFAULT 0,profit_loss REAL NOT NULL DEFAULT 0,peak_units REAL NOT NULL DEFAULT 0,max_drawdown REAL NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(formula_id,selection))");
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_ou_research_v1_daily_test(formula_id TEXT NOT NULL,business_day TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0,settled INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,net_units REAL NOT NULL DEFAULT 0,PRIMARY KEY(formula_id,business_day))");
 for(const f of FORMULAS)for(const side of ['ALL','OVER','UNDER'])
  db.exec("INSERT OR IGNORE INTO b46_adaptive_ou_research_v1_snapshot_test(formula_id,selection) VALUES(?,?)",f,side);
 initialized.add(db);
}
function statUp(db,formula,side,delta,now){
 db.exec("UPDATE b46_adaptive_ou_research_v1_snapshot_test SET total=total+1,pending=pending+1,sum_odds=sum_odds+?,total_units=total_units+1,updated_at=? WHERE formula_id=? AND selection=?",
  delta,now,formula,side);
}
function dayUp(db,formula,when,{selected=0,settled=0,win=0,loss=0,net=0}={}){
 const day=londonAccountingWindow(when).businessDay;
 db.exec("INSERT INTO b46_adaptive_ou_research_v1_daily_test(formula_id,business_day,selected,settled,win,loss,net_units) VALUES(?,?,?,?,?,?,?) ON CONFLICT(formula_id,business_day) DO UPDATE SET selected=selected+excluded.selected,settled=settled+excluded.settled,win=win+excluded.win,loss=loss+excluded.loss,net_units=net_units+excluded.net_units",
  formula,day,selected,settled,win,loss,net);
}
export function recordAdaptiveOu(db,items,now){
 initAdaptiveOuLedger(db);
 if(!Array.isArray(items)||!Number.isSafeInteger(now))throw Error('ADAPTIVE_BAD_ISSUE');
 let added=0,duplicate=0,rejected=0;
 db.transaction(()=>{
  for(const row of items){
   if(!FORMULAS.includes(row.formula)||row.market!=='O/U 2.5'||
    !['OVER','UNDER'].includes(row.selection)||
    !Number.isSafeInteger(row.fixtureId)||row.fixtureId<=0||
    !Number.isSafeInteger(row.homeId)||!Number.isSafeInteger(row.awayId)||
    row.homeId===row.awayId||!Number.isSafeInteger(row.kickoff)||
    row.kickoff<=now+300||!Number.isFinite(row.odds)||row.odds<1.4||row.odds>10||
    typeof row.bookmaker!=='string'||!row.bookmaker||
    !Number.isSafeInteger(row.quoteObservedAt)||
    row.quoteObservedAt>now+10||now-row.quoteObservedAt>120||
    row.quoteObservedAt>=row.kickoff-300||
    row.historyUsed!==Number(row.formula.slice(1))||
    !Array.isArray(row.supportingTeams)||!row.supportingTeams.length||
    row.supportingTeams.some(x=>!['HOME','AWAY'].includes(x))||
    !Array.isArray(row.historyEvidence)||!row.historyEvidence.length){
    rejected++;continue;
   }
   db.exec("INSERT OR IGNORE INTO b46_adaptive_ou_research_v1_ledger_test(fixture_id,formula_id,market,selection,home_id,away_id,home,away,kickoff,picked_at,line,odds,bookmaker,odds_source,quote_observed_at,history_used,supporting_teams,history_evidence,formula_support,opposite_research) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    row.fixtureId,row.formula,row.market,row.selection,row.homeId,row.awayId,
    row.home,row.away,row.kickoff,now,2.5,row.odds,row.bookmaker,
    row.oddsSource,row.quoteObservedAt,row.historyUsed,
    JSON.stringify(row.supportingTeams),JSON.stringify(row.historyEvidence),
    row.supportCount,Number(row.hasContradictoryResearch));
   if(Number(sql(db,'SELECT changes() n')[0]?.n??0)===1){
    added++;
    for(const side of ['ALL',row.selection])statUp(db,row.formula,side,row.odds,now);
    dayUp(db,row.formula,now,{selected:1});
   }else duplicate++;
  }
 });
 return {added,duplicate,rejected,unitsSimulated:added,providerCalls:0,productionWrites:0};
}
// A finished fixture can be verified from the already-cached HUB snapshot even
// when the scheduled HCR cargo has not yet imported its final-score record.
// No new provider request, no archive write, no score based on the clock alone.
function verifiedHubFt(snapshot,p,now){
 if(snapshot?.ok!==true||snapshot?.cacheOnly!==true||snapshot.stale===true||
  !Array.isArray(snapshot.fixtures))return null;
 const ts=snapshot.fetchedAt;
 const observed=Number.isFinite(ts)?(ts>1e12?Math.floor(ts/1000):Math.floor(ts)):
  typeof ts==='string'?Math.floor(Date.parse(ts)/1000):NaN;
 if(!Number.isSafeInteger(observed)||observed>now+60||observed>now+3600||
  now-observed>3600||observed<=p.kickoff)return null;
 const matching=snapshot.fixtures.filter(f=>Number(f?.fixtureId)===Number(p.fixture_id));
 if(matching.length!==1)return null;
 const f=matching[0];
 if(f.status!=='finished'||f.boardState!=='finished'||f.statusCode!=='full'||
  !whole(f.goals?.home)||!whole(f.goals?.away)||
  Number(f.home?.id)!==p.home_id||Number(f.away?.id)!==p.away_id)return null;
 const k=f.kickoffUtc??f.kickoffAt;
 const kickoff=typeof k==='string'?Math.floor(Date.parse(k)/1000):
  Number.isFinite(k)?(k>1e12?Math.floor(k/1000):Math.floor(k)):NaN;
 if(!Number.isSafeInteger(kickoff)||kickoff!==p.kickoff||
  kickoff<=p.picked_at||kickoff>=observed)return null;
 return {fixture_id:p.fixture_id,home_id:p.home_id,away_id:p.away_id,
  kickoff,hg:f.goals.home,ag:f.goals.away,observed,
  source:'HUB_FINISHED_CACHED_VERIFIED'};
}
function verifiedFt(db,p,now,snapshot=null){
 const a=sql(db,"SELECT fixture_id,home_id,away_id,kickoff,hg,ag,observed FROM result_version WHERE fixture_id=? AND home_id=? AND away_id=? AND status='finished' AND observed<=? ORDER BY observed DESC LIMIT 1",p.fixture_id,p.home_id,p.away_id,now)[0];
 const b=a?null:sql(db,"SELECT fixture_id,home_id,away_id,kickoff,hg,ag,observed FROM b46_ou_target_history_ft_v1 WHERE fixture_id=? AND home_id=? AND away_id=? AND observed<=? ORDER BY observed DESC LIMIT 1",p.fixture_id,p.home_id,p.away_id,now)[0];
 const ft=a??b??verifiedHubFt(snapshot,p,now);
 if(!ft||!whole(ft.hg)||!whole(ft.ag)||
  !Number.isSafeInteger(ft.observed)||ft.observed<ft.kickoff||
  ft.kickoff<=p.picked_at||ft.kickoff!==p.kickoff)return null;
 return {...ft,source:a?'HCR_FINISHED_FT':b?'OU_ARCHIVED_VERIFIED_FT':ft.source};
}
function settleSnapshot(db,formula,selection,net,won,now){
 const row=sql(db,"SELECT profit_loss,peak_units,max_drawdown FROM b46_adaptive_ou_research_v1_snapshot_test WHERE formula_id=? AND selection=?",formula,selection)[0];
 if(!row)throw Error('MISSING_ADAPTIVE_SNAPSHOT');
 const next=dollars(Number(row.profit_loss)+net);
 const peak=Math.max(Number(row.peak_units),next);
 const drawdown=Math.max(Number(row.max_drawdown),peak-next);
 db.exec("UPDATE b46_adaptive_ou_research_v1_snapshot_test SET pending=pending-1,win=win+?,loss=loss+?,settled_units=settled_units+1,profit_loss=?,peak_units=?,max_drawdown=?,updated_at=? WHERE formula_id=? AND selection=?",
  Number(won),Number(!won),next,dollars(peak),dollars(drawdown),now,formula,selection);
}
export function settleAdaptiveOu(db,now,{snapshot=null}={}){
 initAdaptiveOuLedger(db);initOuTargetHistoryFT(db);
 const pending=sql(db,"SELECT * FROM b46_adaptive_ou_research_v1_ledger_test WHERE status='PENDING' AND kickoff<? ORDER BY kickoff,fixture_id,formula_id,selection LIMIT 5000",now);
 let settled=0,win=0,loss=0,noFt=0;
 db.transaction(()=>{
  for(const p of pending){
   const ft=verifiedFt(db,p,now,snapshot);
   if(!ft){noFt++;continue}
   const won=p.selection==='OVER'?ft.hg+ft.ag>=3:ft.hg+ft.ag<=2;
   const net=dollars(won?p.odds-1:-1);
   db.exec("UPDATE b46_adaptive_ou_research_v1_ledger_test SET status=?,hg=?,ag=?,settled_at=?,result_observed_at=?,result_source=?,net_units=? WHERE fixture_id=? AND formula_id=? AND market=? AND selection=? AND status='PENDING'",
    won?'WIN':'LOSS',ft.hg,ft.ag,now,ft.observed,ft.source,net,
    p.fixture_id,p.formula_id,p.market,p.selection);
   if(Number(sql(db,'SELECT changes() n')[0]?.n??0)!==1)continue;
   settled++;win+=Number(won);loss+=Number(!won);
   for(const side of ['ALL',p.selection])settleSnapshot(db,p.formula_id,side,net,won,now);
   dayUp(db,p.formula_id,now,{settled:1,win:Number(won),loss:Number(!won),net});
  }
 });
 return {settled,win,loss,missingVerifiedFt:noFt,providerCalls:0,otherLedgersTouched:false};
}
function summarize(s){
 const total=Number(s.total),win=Number(s.win),loss=Number(s.loss),settled=win+loss;
 const pnl=Number(s.profit_loss);
 return {formula:s.formula_id,selection:s.selection,historyUsed:Number(s.formula_id.slice(1)),
  totalPredictions:total,pending:Number(s.pending),settled,win,loss,
  winRate:settled?Math.round(10000*win/settled)/100:null,
  averageOdds:total?Math.round(10000*Number(s.sum_odds)/total)/10000:null,
  totalUnits: Number(s.total_units),settledUnits:Number(s.settled_units),
  profitLoss:pnl,roi:settled?Math.round(10000*pnl/settled)/100:null,
  maximumDrawdown:Number(s.max_drawdown)};
}
export function readAdaptiveStats(db,now,{limit=500}={}){
 initAdaptiveOuLedger(db);
 const rows=sql(db,"SELECT * FROM b46_adaptive_ou_research_v1_snapshot_test ORDER BY formula_id,selection");
 const stats=rows.filter(r=>r.selection==='ALL').map(summarize);
 const sides=rows.filter(r=>r.selection!=='ALL').map(summarize);
 const recent=sql(db,"SELECT * FROM b46_adaptive_ou_research_v1_ledger_test ORDER BY picked_at DESC,fixture_id,formula_id,selection LIMIT ?",limit);
 const currentDay=londonAccountingWindow(now).businessDay;
 const days=sql(db,"SELECT * FROM b46_adaptive_ou_research_v1_daily_test WHERE business_day<=? ORDER BY business_day DESC,formula_id LIMIT 4000",currentDay);
 for(const s of rows)if(s.total!==s.pending+s.win+s.loss)throw Error('ADAPTIVE_SNAPSHOT_INVARIANT');
 return {code:ADAPTIVE_OU_ID,isolated:true,allFormulas:FORMULAS.length,
  rulesAreExperimental:true,portfolioTotalIsNotReal:true,
  cutoff:'06:00 Europe/London',businessDay:currentDay,
  formulas:stats,bySelection:sides,daily:days,
  records:recent.map(x=>({...x,
   supporting_teams:JSON.parse(x.supporting_teams),
   history_evidence:JSON.parse(x.history_evidence)})),
  providerCalls:0,productionWrites:0};
}
export async function runAdaptiveOu(db,{fixtures,now,market}={}){
 if(!db||!Array.isArray(fixtures)||!Number.isSafeInteger(now)||typeof market!=='function')
  throw Error('ADAPTIVE_BAD_TICK');
 const raw=screenAdaptiveResearch(db,fixtures,now);
 const offersByFixture=new Map();
 const fixtureIds=[...new Set(raw.candidates.map(c=>c.fixtureId))];
 let unavailable=0,pricedFixtures=0,priceQuotes=0;
 for(let i=0;i<fixtureIds.length;i+=70){
  const batch=fixtureIds.slice(i,i+70);
  let reply;
  try{reply=await market('/board-cache',{method:'POST',
    body:{fixtureIds:batch.map(String)}})}catch{reply=null}
  if(!reply||reply.ok!==true||reply.externalRequestsAdded!==0||
   !reply.entries||typeof reply.entries!=='object'){unavailable+=batch.length;continue}
  for(const fixtureId of batch){
   const representative=raw.candidates.find(x=>x.fixtureId===fixtureId);
   const parsed=extractFullMarketOuOffers(reply.entries[String(fixtureId)]??null,
    fixtureId,now,representative.kickoff);
   const available=parsed.offers.filter(q=>q.line===2.5);
   if(available.length)pricedFixtures++;else unavailable++;
   const options={OVER:[],UNDER:[]};
   for(const q of available)for(const side of ['OVER','UNDER']){
    const odds=q[side.toLowerCase()];
    if(!Number.isFinite(odds)||odds<1.40||odds>10)continue;
    options[side].push({...q,odds,side});
    priceQuotes++;
   }
   for(const side of ['OVER','UNDER']){
    options[side].sort((a,b)=>b.odds-a.odds||
     Number(b.stage==='closing')-Number(a.stage==='closing')||
     a.bookmaker.localeCompare(b.bookmaker));
    if(options[side].length)offersByFixture.set(fixtureId+'/'+side,options[side][0]);
   }
  }
 }
 const priced=[];
 const countPerFormula=Object.fromEntries(FORMULAS.map(x=>[x,0]));
 for(const c of raw.candidates){
  const quote=offersByFixture.get(c.fixtureId+'/'+c.selection);
  if(!quote)continue;
  priced.push({...c,odds:quote.odds,bookmaker:quote.bookmaker,
   oddsSource:quote.source,quoteObservedAt:quote.sourceObservedAt,
   priceStage:quote.stage});
  countPerFormula[c.formula]++;
  raw.formulaCounts[c.formula].pricedFixtures++;
 }
 const record=recordAdaptiveOu(db,priced,now);
 const settlement=settleAdaptiveOu(db,now);
 const stats=readAdaptiveStats(db,now);
 for(const s of stats.formulas)raw.formulaCounts[s.formula].issued=s.totalPredictions;
 return {code:ADAPTIVE_OU_ID,
  raw:{counts:raw.counts,formulaCounts:raw.formulaCounts,
   candidates:raw.candidates.slice(0,2500)},
  priced:{fixtures:pricedFixtures,quotes:priceQuotes,
   matchedFormulaSelections:priced.length,unavailableFixtures:unavailable,
   perFormula:countPerFormula},
  record,settlement,
  stats:{formulas:stats.formulas,bySelection:stats.bySelection,
   totalLedgerRows:stats.records.length},
  maxPriceAgeMs:120000,priceRange:[1.4,10],
  providerCalls:0,productionWrites:0};
}

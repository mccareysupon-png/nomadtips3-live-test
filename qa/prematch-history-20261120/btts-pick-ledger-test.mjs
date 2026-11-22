// Independent experimental BTTS pick ledger. Never writes 1X2 ledger,
// normal FT HCR, worker production, receiver statistics, or live signals.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {BTTS_ULTRA_TEST_POLICY} from './btts-ultra-shadow.mjs';
const arr=(db,q,...v)=>Array.from(db.exec(q,...v));
const id=x=>/^[1-9]\d*$/.test(String(x??''))&&Number.isSafeInteger(Number(x));
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>1;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const sides=new Set(['BTTS_YES','BTTS_NO']);
const statsOf=s=>{
 const total=Number(s?.total??0),pending=Number(s?.pending??0),win=Number(s?.win??0),loss=Number(s?.loss??0),units=Number(s?.units??0);
 return {total,pending,win,loss,units,settled:win+loss,winRate:win+loss?100*win/(win+loss):null};
};
const combine=(a,b)=>statsOf({total:a.total+b.total,pending:a.pending+b.pending,win:a.win+b.win,loss:a.loss+b.loss,units:a.units+b.units});
export function initBttsPickLedger(db){
 db.exec("CREATE TABLE IF NOT EXISTS test_pick_btts (fixture_id INTEGER PRIMARY KEY, home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, league_id INTEGER NOT NULL, league_name TEXT NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, kickoff INTEGER NOT NULL, picked_at INTEGER NOT NULL, observed INTEGER NOT NULL, pick TEXT NOT NULL CHECK(pick IN ('BTTS_YES','BTTS_NO')), price REAL NOT NULL, probability REAL NOT NULL, edge REAL NOT NULL, ev REAL NOT NULL, home_count INTEGER NOT NULL, away_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', hg INTEGER, ag INTEGER, settled_at INTEGER, units REAL, model TEXT NOT NULL, source TEXT NOT NULL)");
 db.exec('CREATE INDEX IF NOT EXISTS btts_pick_settlement ON test_pick_btts(status,kickoff)');
}
export function bttsPicksFromScreen(report,fixtures,now){
 if(!Number.isSafeInteger(now)||!Array.isArray(fixtures)||report?.mode!=='READ_ONLY_BTTS_SHADOW')throw Error('INVALID_SCREEN_EVIDENCE');
 const map=new Map(fixtures.map(x=>[String(x.id),x]));
 const picks=[];
 for(const row of report.decisions??[]){
  const f=map.get(String(row.fixtureId));
  if(!f||f.status!=='scheduled'||f.kickoff_ts<=now||
     !id(f.teams?.home?.id)||!id(f.teams?.away?.id)||!id(f.league?.id)||
     row.homeHistory<BTTS_ULTRA_TEST_POLICY.minHistory||row.homeHistory>BTTS_ULTRA_TEST_POLICY.historyPerTeam||
     row.awayHistory<BTTS_ULTRA_TEST_POLICY.minHistory||row.awayHistory>BTTS_ULTRA_TEST_POLICY.historyPerTeam||
     !sides.has(row.signal))continue;
  const side=row.metrics?.sides?.find(x=>x.signal===row.signal&&x.passed===true);
  if(!side||!price(side.price)||!finite(side.model)||!finite(side.edge)||!finite(side.ev)||
     side.model<0.60||side.edge<0.05||side.ev<0.05||!Number.isSafeInteger(row.oddsObserved)||
     row.oddsObserved>=f.kickoff_ts||row.oddsObserved>now||
     !['STORED_BET365','5USD_FIXTURE_BET365_BTTS','BET365_STORED'].includes(row.quoteSource))continue;
  picks.push({id:Number(f.id),homeId:Number(f.teams.home.id),awayId:Number(f.teams.away.id),
   leagueId:Number(f.league.id),leagueName:String(f.league.name??''),
   home:String(row.home),away:String(row.away),kickoff:f.kickoff_ts,pickedAt:now,
   observed:row.oddsObserved,pick:row.signal,price:side.price,probability:side.model,
   edge:side.edge,ev:side.ev,homeCount:row.homeHistory,awayCount:row.awayHistory,
   model:'btts-ultra-history10-shadow-v1',source:row.quoteSource});
 }
 return picks;
}
export function recordBttsPicks(db,picks,now){
 if(!Array.isArray(picks)||picks.length>1000||!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_BTTS_PICKS');
 const result={added:0,duplicate:0,rejected:0};
 db.transaction(()=>{
  for(const p of picks){
   const ok=[p.id,p.homeId,p.awayId,p.leagueId,p.kickoff,p.pickedAt,p.observed].every(id)&&
    p.homeId!==p.awayId&&p.pickedAt<=now&&p.pickedAt<p.kickoff&&p.observed<=p.pickedAt&&
    sides.has(p.pick)&&price(p.price)&&p.price>=1.5&&p.price<=10&&
    finite(p.probability)&&p.probability>=.60&&p.probability<=1&&
    finite(p.edge)&&p.edge>=.05&&finite(p.ev)&&p.ev>=.05&&
    Number.isInteger(p.homeCount)&&p.homeCount>=BTTS_ULTRA_TEST_POLICY.minHistory&&p.homeCount<=BTTS_ULTRA_TEST_POLICY.historyPerTeam&&
    Number.isInteger(p.awayCount)&&p.awayCount>=BTTS_ULTRA_TEST_POLICY.minHistory&&p.awayCount<=BTTS_ULTRA_TEST_POLICY.historyPerTeam&&
    typeof p.home==='string'&&p.home.trim()&&typeof p.away==='string'&&p.away.trim()&&
    typeof p.leagueName==='string'&&p.leagueName.length<=180&&
    p.model==='btts-ultra-history10-shadow-v1'&&
    ['STORED_BET365','5USD_FIXTURE_BET365_BTTS','BET365_STORED'].includes(p.source);
   if(!ok){result.rejected++;continue}
   const old=arr(db,'SELECT fixture_id FROM test_pick_btts WHERE fixture_id=?',p.id);
   if(old.length){result.duplicate++;continue}
   db.exec("INSERT INTO test_pick_btts (fixture_id,home_id,away_id,league_id,league_name,home,away,kickoff,picked_at,observed,pick,price,probability,edge,ev,home_count,away_count,model,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    p.id,p.homeId,p.awayId,p.leagueId,p.leagueName,p.home,p.away,p.kickoff,p.pickedAt,p.observed,p.pick,p.price,p.probability,p.edge,p.ev,p.homeCount,p.awayCount,p.model,p.source);
   result.added++;
  }
 });
 return result;
}
export function settleBttsPicks(db,now){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_BTTS_SETTLEMENT_TIME');
 let settled=0;
 db.transaction(()=>{
  const rows=arr(db,`SELECT p.*,r.hg AS result_hg,r.ag AS result_ag,r.observed AS result_observed
  FROM test_pick_btts p JOIN result_version r
   ON r.fixture_id=p.fixture_id AND r.home_id=p.home_id AND r.away_id=p.away_id
  WHERE p.status='PENDING' AND p.picked_at<r.kickoff AND r.kickoff<?
   AND r.status='finished' AND r.observed>r.kickoff AND r.observed<=?
   AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?)`,now,now,now);
  for(const p of rows){
   const yes=p.result_hg>0&&p.result_ag>0;
   const won=p.pick===(yes?'BTTS_YES':'BTTS_NO');
   db.exec("UPDATE test_pick_btts SET status=?,hg=?,ag=?,settled_at=?,units=? WHERE fixture_id=? AND status='PENDING'",
    won?'WIN':'LOSS',p.result_hg,p.result_ag,now,won?p.price-1:-1,p.fixture_id);
   settled++;
  }
 });
 return settled;
}
export function bttsPickLedger(db){
 const rows=arr(db,"SELECT *, 'BTTS' AS market, league_name AS leagueName FROM test_pick_btts ORDER BY kickoff,fixture_id LIMIT 1000");
 const sum=arr(db,"SELECT COUNT(*) AS total,COALESCE(SUM(status='PENDING'),0) AS pending,COALESCE(SUM(status='WIN'),0) AS win,COALESCE(SUM(status='LOSS'),0) AS loss,COALESCE(SUM(units),0) AS units FROM test_pick_btts")[0];
 return {rows,stats:statsOf(sum),market:'BTTS',mode:'TEST_ONLY',published:0};
}
export function combinedPrematchLedgers(oneX2,btts){
 if(oneX2?.mode!=='TEST_ONLY'||btts?.mode!=='TEST_ONLY')throw Error('INVALID_MARKET_LEDGERS');
 const rows=[...oneX2.rows.map(x=>({...x,market:'1X2'})),...btts.rows].sort((a,b)=>a.kickoff-b.kickoff||
  a.fixture_id-b.fixture_id||String(a.market).localeCompare(String(b.market)));
 return {rows,stats:combine(oneX2.stats,btts.stats),market:'ALL',mode:'TEST_ONLY',published:0};
}
export function marketDailyBooks(db,now){
 const window=londonAccountingWindow(now),{begin,end}=window;
 const tab=t=>{
  const selected=arr(db,`SELECT COUNT(*) AS total,COALESCE(SUM(status='PENDING'),0) AS pending FROM ${t} WHERE picked_at>=? AND picked_at<?`,begin,end)[0];
  const settled=arr(db,`SELECT COUNT(*) AS total,COALESCE(SUM(status='WIN'),0) AS win,COALESCE(SUM(status='LOSS'),0) AS loss,COALESCE(SUM(units),0) AS units FROM ${t} WHERE settled_at>=? AND settled_at<?`,begin,end)[0];
  const pending=arr(db,`SELECT COUNT(*) AS total FROM ${t} WHERE status='PENDING'`)[0];
  const win=Number(settled.win||0),loss=Number(settled.loss||0);
  return {window,selected:{total:Number(selected.total||0),pending:Number(selected.pending||0)},
   settled:{total:Number(settled.total||0),win,loss,
     winRate:win+loss?100*win/(win+loss):null,units:Number(settled.units||0)},
   carriedPending:Number(pending.total||0),basis:'SETTLED_AT_FOR_WINRATE_AND_PL',
   model:'LONDON_06_SHARED_WITH_LIVE',providerCalls:0};
 };
 const oneX2=tab('test_pick_1x2'),btts=tab('test_pick_btts');
 const win=oneX2.settled.win+btts.settled.win,loss=oneX2.settled.loss+btts.settled.loss;
 const all={...oneX2,selected:{total:oneX2.selected.total+btts.selected.total,
    pending:oneX2.selected.pending+btts.selected.pending},
  settled:{total:oneX2.settled.total+btts.settled.total,win,loss,
   winRate:win+loss?100*win/(win+loss):null,
   units:oneX2.settled.units+btts.settled.units},
  carriedPending:oneX2.carriedPending+btts.carriedPending};
 return {oneX2,btts,all};
}
export function bttsDailySeries(db,market='BTTS'){
 if(!['BTTS','ALL'].includes(market))throw Error('INVALID_BTTS_SERIES');
 const result=[];
 // Read historical settlements only, not partial volatile candidate lists.
 const query=market==='BTTS'
  ? "SELECT settled_at,units,status FROM test_pick_btts WHERE status IN ('WIN','LOSS') ORDER BY settled_at,fixture_id"
  : "SELECT settled_at,units,status FROM test_pick_btts WHERE status IN ('WIN','LOSS') UNION ALL SELECT settled_at,units,status FROM test_pick_1x2 WHERE status IN ('WIN','LOSS') ORDER BY settled_at";
 const acc=new Map();
 for(const p of arr(db,query)){
  const businessDay=londonAccountingWindow(Number(p.settled_at)).businessDay;
  const old=acc.get(businessDay)||{date:businessDay,netUnits:0,stakedUnits:0,win:0,loss:0,draw:0,halfWin:0,halfLoss:0};
  old.netUnits+=Number(p.units||0);old.stakedUnits+=1;
  if(p.status==='WIN')old.win++;else old.loss++;
  acc.set(businessDay,old);
 }
 let cumulativeUnits=0;
 for(const x of [...acc.values()].sort((a,b)=>a.date.localeCompare(b.date))){
  cumulativeUnits+=x.netUnits;result.push({...x,cumulativeUnits});
 }
 return result;
}

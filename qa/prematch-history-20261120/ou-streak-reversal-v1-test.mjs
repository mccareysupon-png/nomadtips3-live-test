// BALL46 TEST ONLY — independent two-match goal-total reversal.
// Two consecutive >2.5 => next UNDER 2.5; two <=2.5 => next OVER 2.5.
// Either team qualifies; opposite team directions cause a CONFLICT, not a pick.
// History only, no bookmaker price, no staking/P&L/EV claims, no provider calls.
// Uses entirely separate TEST ledger, settlement, snapshot, daily stats.
import {ouTargetLastMatches,initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {londonAccountingWindow} from './london-cutoff.mjs';
const query=(db,q,...a)=>Array.from(db.exec(q,...a));
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const whole=x=>Number.isSafeInteger(x)&&x>=0;
export const STREAK_REVERSAL_POLICY=Object.freeze({
 code:'B46_OU_2MATCH_REVERSAL_V1_TEST',
 latestFinished:2,line:2.5,
 twoOversResult:'UNDER',twoUndersResult:'OVER',
 teamMode:'EITHER_TEAM',onOppositeSignals:'CONFLICT_NO_PREDICTION',
 requireBookmakerPrice:false,profitLossWithoutPrice:false,
 statsNamespace:'B46_OU_STREAK_REVERSAL_V1_ONLY',
 providerCalls:0,productionWrites:0,combineWithOtherStats:false
});
export function twoMatchDirection(hist){
 if(!Array.isArray(hist)||hist.length<2)return null;
 const last=hist.slice(0,2);
 if(last.some(m=>!whole(m?.gf)||!whole(m?.ga)))return null;
 const totals=last.map(m=>m.gf+m.ga);
 if(totals.every(n=>n>=3))return 'OVER';
 if(totals.every(n=>n<=2))return 'UNDER';
 return null;
}
export function reverseStreak(homeHist,awayHist){
 const homeForm=twoMatchDirection(homeHist),awayForm=twoMatchDirection(awayHist);
 const toPick=x=>x==='OVER'?'UNDER':x==='UNDER'?'OVER':null;
 const homePick=toPick(homeForm),awayPick=toPick(awayForm);
 const conflict=!!homePick&&!!awayPick&&homePick!==awayPick;
 const pick=conflict?null:homePick||awayPick;
 return {pick,conflict,homeForm,awayForm,
  homeLastTwo:homeHist.slice(0,2).map(m=>({fixtureId:m.fixtureId,goals:m.gf+m.ga,score:m.gf+'-'+m.ga})),
  awayLastTwo:awayHist.slice(0,2).map(m=>({fixtureId:m.fixtureId,goals:m.gf+m.ga,score:m.gf+'-'+m.ga}))};
}
export function screenStreakReversal(db,fixtures,now){
 if(!db||!Array.isArray(fixtures)||!Number.isSafeInteger(now))throw Error('BAD_STREAK_SCREEN_ARGS');
 const seen=new Set(),candidates=[],conflicts=[];
 const counts={feed:fixtures.length,validUpcoming:0,
  underCandidates:0,overCandidates:0,conflicts:0,missingHistoryBoth:0,missingHistoryEither:0,
  providerCalls:0,priceRequests:0};
 for(const f of fixtures){
  const fid=Number(f?.id),hid=Number(f?.teams?.home?.id),aid=Number(f?.teams?.away?.id),kickoff=f?.kickoff_ts;
  if(!id(fid)||!id(hid)||!id(aid)||hid===aid||seen.has(fid)||
   f?.status!=='scheduled'||!Number.isSafeInteger(kickoff)||
   kickoff<=now+300||kickoff>now+14*86400)continue;
  counts.validUpcoming++;seen.add(fid);
  const hh=ouTargetLastMatches(db,hid,kickoff,now,2),ah=ouTargetLastMatches(db,aid,kickoff,now,2);
  if(hh.length<2||ah.length<2)counts.missingHistoryEither++;
  if(hh.length<2&&ah.length<2)counts.missingHistoryBoth++;
  const rule=reverseStreak(hh,ah);
  const item={fixtureId:fid,homeId:hid,awayId:aid,
   home:String(f.teams.home.name??hid).slice(0,160),
   away:String(f.teams.away.name??aid).slice(0,160),
   kickoff, ...rule,line:2.5};
  if(rule.conflict){counts.conflicts++;conflicts.push(item);continue}
  if(!rule.pick)continue;
  if(rule.pick==='OVER')counts.overCandidates++;else counts.underCandidates++;
  candidates.push(item);
 }
 return {mode:STREAK_REVERSAL_POLICY.code,policy:STREAK_REVERSAL_POLICY,
  when:new Date(now*1000).toISOString(),counts,candidates,conflicts};
}
export function initStreakLedger(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_streak_reversal_v1_picks_test(fixture_id INTEGER PRIMARY KEY,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,home TEXT NOT NULL,away TEXT NOT NULL,kickoff INTEGER NOT NULL,picked_at INTEGER NOT NULL,pick TEXT NOT NULL CHECK(pick IN ('OVER','UNDER')),line REAL NOT NULL CHECK(line=2.5),home_form TEXT,away_form TEXT,evidence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','WIN','LOSS')),hg INTEGER,ag INTEGER,settled_at INTEGER,result_observed_at INTEGER,result_source TEXT)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_streak_pending_test ON b46_ou_streak_reversal_v1_picks_test(status,kickoff)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_streak_reversal_v1_snapshot_test(id INTEGER PRIMARY KEY CHECK(id=1),total INTEGER NOT NULL DEFAULT 0,pending INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,under_picks INTEGER NOT NULL DEFAULT 0,over_picks INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
 db.exec("INSERT OR IGNORE INTO b46_ou_streak_reversal_v1_snapshot_test(id) VALUES(1)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_streak_reversal_v1_daily_test(business_day TEXT PRIMARY KEY,selected INTEGER NOT NULL DEFAULT 0,settled INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
}
function incrementDaily(db,day,selected,settled,win,loss,now){
 db.exec("INSERT INTO b46_ou_streak_reversal_v1_daily_test(business_day,selected,settled,win,loss,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(business_day) DO UPDATE SET selected=selected+excluded.selected,settled=settled+excluded.settled,win=win+excluded.win,loss=loss+excluded.loss,updated_at=excluded.updated_at",day,selected,settled,win,loss,now);
}
export function issueStreakPicks(db,candidates,now){
 if(!Array.isArray(candidates)||!Number.isSafeInteger(now))throw Error('BAD_STREAK_ISSUE_INPUT');
 initStreakLedger(db);
 let added=0,duplicate=0,rejected=0;
 db.transaction(()=>{
  for(const c of candidates){
   if(!id(c.fixtureId)||!id(c.homeId)||!id(c.awayId)||c.homeId===c.awayId||
    !['OVER','UNDER'].includes(c.pick)||c.conflict||
    c.kickoff<=now+300||!Number.isSafeInteger(c.kickoff)){
    rejected++;continue;
   }
   const ev=JSON.stringify({homeForm:c.homeForm,awayForm:c.awayForm,
    homeLastTwo:c.homeLastTwo,awayLastTwo:c.awayLastTwo});
   db.exec("INSERT OR IGNORE INTO b46_ou_streak_reversal_v1_picks_test(fixture_id,home_id,away_id,home,away,kickoff,picked_at,pick,line,home_form,away_form,evidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    c.fixtureId,c.homeId,c.awayId,c.home,c.away,c.kickoff,now,c.pick,2.5,c.homeForm,c.awayForm,ev);
   if(Number(query(db,'SELECT changes() AS n')[0]?.n??0)===1){
    added++;
    db.exec("UPDATE b46_ou_streak_reversal_v1_snapshot_test SET total=total+1,pending=pending+1,under_picks=under_picks+?,over_picks=over_picks+?,updated_at=? WHERE id=1",Number(c.pick==='UNDER'),Number(c.pick==='OVER'),now);
    incrementDaily(db,londonAccountingWindow(now).businessDay,1,0,0,0,now);
   }else duplicate++;
  }
 });
 return {added,duplicate,rejected,providerCalls:0,otherStatsTouched:false};
}
function verifiedResult(db,p,now){
 const from1=query(db,"SELECT fixture_id,home_id,away_id,kickoff,hg,ag,observed FROM result_version WHERE fixture_id=? AND home_id=? AND away_id=? AND status='finished' AND observed<=? ORDER BY observed DESC LIMIT 1",p.fixture_id,p.home_id,p.away_id,now)[0];
 const from2=from1?null:query(db,"SELECT fixture_id,home_id,away_id,kickoff,hg,ag,observed FROM b46_ou_target_history_ft_v1 WHERE fixture_id=? AND home_id=? AND away_id=? AND observed<=? ORDER BY observed DESC LIMIT 1",p.fixture_id,p.home_id,p.away_id,now)[0];
 const row=from1??from2;
 if(!row||!whole(row.hg)||!whole(row.ag)||!Number.isSafeInteger(row.kickoff)||
  row.kickoff<=p.picked_at||!Number.isSafeInteger(row.observed)||
  row.observed<row.kickoff)return null;
 return {...row,source:from1?'FT_ARCHIVE':'OU_VERIFIED_FT_VAULT'};
}
export function settleStreakPicks(db,now){
 if(!Number.isSafeInteger(now))throw Error('BAD_STREAK_SETTLE_TIME');
 initStreakLedger(db);initOuTargetHistoryFT(db);
 const pending=query(db,"SELECT * FROM b46_ou_streak_reversal_v1_picks_test WHERE status='PENDING' AND kickoff<? ORDER BY kickoff,fixture_id LIMIT 1000",now);
 let settled=0,win=0,loss=0,noFt=0;
 db.transaction(()=>{
  for(const p of pending){
   const ft=verifiedResult(db,p,now);
   if(!ft){noFt++;continue}
   const won=p.pick==='OVER'?ft.hg+ft.ag>=3:ft.hg+ft.ag<=2,status=won?'WIN':'LOSS';
   db.exec("UPDATE b46_ou_streak_reversal_v1_picks_test SET status=?,hg=?,ag=?,settled_at=?,result_observed_at=?,result_source=? WHERE fixture_id=? AND status='PENDING'",
    status,ft.hg,ft.ag,now,ft.observed,ft.source,p.fixture_id);
   if(Number(query(db,'SELECT changes() AS n')[0]?.n??0)!==1)continue;
   settled++;if(won)win++;else loss++;
   db.exec("UPDATE b46_ou_streak_reversal_v1_snapshot_test SET pending=pending-1,win=win+?,loss=loss+?,updated_at=? WHERE id=1",Number(won),Number(!won),now);
   incrementDaily(db,londonAccountingWindow(now).businessDay,0,1,Number(won),Number(!won),now);
  }
 });
 return {settled,win,loss,noVerifiedFT:noFt,providerCalls:0};
}
export function readStreakStats(db,now,{limit=200}={}){
 initStreakLedger(db);
 const s=query(db,"SELECT * FROM b46_ou_streak_reversal_v1_snapshot_test WHERE id=1")[0];
 const day=londonAccountingWindow(now).businessDay;
 const days=query(db,"SELECT * FROM b46_ou_streak_reversal_v1_daily_test WHERE business_day<=? ORDER BY business_day DESC LIMIT 90",day);
 const records=query(db,"SELECT fixture_id,home,away,kickoff,picked_at,pick,line,home_form,away_form,evidence,status,hg,ag,settled_at,result_source FROM b46_ou_streak_reversal_v1_picks_test ORDER BY picked_at DESC,fixture_id DESC LIMIT ?",limit);
 const rate=(w,l)=>w+l?Math.round(10000*w/(w+l))/100:null;
 const win=Number(s.win),loss=Number(s.loss);
 if(s.total!==s.pending+win+loss)throw Error('STREAK_SNAPSHOT_INVARIANT');
 const current=days.find(d=>d.business_day===day);
 return {mode:STREAK_REVERSAL_POLICY.code,isolated:true,
  neverCombinedWith1X2BtssOu:true,priceIndependent:true,hasPricedPL:false,
  cutoff:'06:00 Europe/London',businessDay:day,
  stats:{total:s.total,pending:s.pending,win,loss,settled:win+loss,winRate:rate(win,loss),
   underPicks:s.under_picks,overPicks:s.over_picks},
  today:{selected:current?.selected??0,settled:current?.settled??0,
   win:current?.win??0,loss:current?.loss??0,
   winRate:rate(current?.win??0,current?.loss??0)},
  daily:days.reverse().map(x=>({...x,winRate:rate(x.win,x.loss)})),
  records:records.map(x=>({...x,evidence:JSON.parse(x.evidence)})),
  providerCalls:0,productionWrites:0};
}
export function runStreakReversal(db,fixtures,now){
 const screening=screenStreakReversal(db,fixtures,now);
 const issued=issueStreakPicks(db,screening.candidates,now);
 const settlement=settleStreakPicks(db,now);
 return {screening:{...screening,candidates:screening.candidates.slice(0,100),
  conflicts:screening.conflicts.slice(0,100)},issued,settlement,stats:readStreakStats(db,now),
  providerCalls:0,productionWrites:0};
}

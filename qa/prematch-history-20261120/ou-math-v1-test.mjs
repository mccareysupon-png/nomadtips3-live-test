// BALL46 O/U Math V1 — Pre-Match TEST only. Probability-only research,
// never invent O/U odds, EV, ROI or P/L. Independent persisted ledger/snapshot.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {bttsLastMatches} from './btts-history-private.mjs';
const get=(db,q,...v)=>Array.from(db.exec(q,...v));
const num=x=>typeof x==='number'&&Number.isFinite(x);
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
export const OU_MODEL='ou-poisson-shrinkage-2p5-v1';
export const OU_POLICY=Object.freeze({model:OU_MODEL,line:2.5,minHistory:3,maxHistory:10,minProbability:.64,maxLookaheadSec:259200,providerCalls:0,quoteStatus:'MODEL_ONLY'});
export function poissonOver25(lambda){
 if(!num(lambda)||lambda<=0||lambda>15)throw Error('INVALID_OU_LAMBDA');
 return clamp(1-Math.exp(-lambda)*(1+lambda+lambda*lambda/2),0,1);
}
const mean=(xs,field,prior,pseudo=6)=>{
 let sum=prior*pseudo,n=pseudo;
 for(let i=0;i<xs.length;i++){
  const v=Number(xs[i][field]);if(!num(v)||v<0)continue;
  const w=.88**i;sum+=v*w;n+=w;
 }
 return sum/n;
};
export function estimateOu25(home,away,league={home:1.38,away:1.15}){
 if(!Array.isArray(home)||!Array.isArray(away)||home.length<3||away.length<3)return {state:'INSUFFICIENT_HISTORY'};
 const lh=clamp(league.home,.6,2.8),la=clamp(league.away,.5,2.4),mid=(lh+la)/2;
 const hgf=mean(home,'gf',mid),hga=mean(home,'ga',mid);
 const agf=mean(away,'gf',mid),aga=mean(away,'ga',mid);
 const homeVenue=home.filter(x=>x.venue==='home'),awayVenue=away.filter(x=>x.venue==='away');
 const hvGF=mean(homeVenue,'gf',hgf,4),hvGA=mean(homeVenue,'ga',hga,4);
 const avGF=mean(awayVenue,'gf',agf,4),avGA=mean(awayVenue,'ga',aga,4);
 const lambdaHome=clamp(lh*Math.sqrt(hvGF*avGA/(mid*mid)),.30,3.5);
 const lambdaAway=clamp(la*Math.sqrt(avGF*hvGA/(mid*mid)),.25,3.2);
 const expectedTotalGoals=lambdaHome+lambdaAway,overProbability=poissonOver25(expectedTotalGoals);
 const pick=overProbability>=.5?'OVER_2.5':'UNDER_2.5',probability=Math.max(overProbability,1-overProbability);
 return {state:probability>=OU_POLICY.minProbability?'QUALIFIED':'PROBABILITY_BELOW',
  pick,line:2.5,probability,overProbability,lambdaHome,lambdaAway,expectedTotalGoals,
  homeCount:home.length,awayCount:away.length,price:null,ev:null,edge:null,calibrated:false,model:OU_MODEL};
}
const LEAGUE_SQL="SELECT r.hg,r.ag FROM result_version r WHERE r.league_id=? AND r.status='finished' AND r.kickoff<? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT 120";
function leaguePrior(db,league,kickoff,cache){
 const k=String(league)+'/'+String(kickoff);
 if(cache.has(k))return cache.get(k);
 const history=id(league)?get(db,LEAGUE_SQL,Number(league),kickoff):[];
 let h=1.38*20,a=1.15*20,n=20;
 for(const x of history){if(!num(x.hg)||!num(x.ag))continue;h+=x.hg;a+=x.ag;n++}
 const out={home:h/n,away:a/n,leagueHistory:history.length};cache.set(k,out);return out;
}
function historicalMatches(db,team,kickoff){
 // Only for retrospective goal-model simulation; evidence was archived later.
 const sql="SELECT r.fixture_id,r.home_id,r.away_id,r.hg,r.ag FROM result_version r WHERE (r.home_id=? OR r.away_id=?) AND r.status='finished' AND r.kickoff<? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT 10";
 return get(db,sql,team,team,kickoff).map(r=>{
  const h=r.home_id===team;
  return {fixtureId:r.fixture_id,venue:h?'home':'away',gf:h?r.hg:r.ag,ga:h?r.ag:r.hg};
 });
}
export function screenOu(db,fixtures,now,limit=350){
 if(!Array.isArray(fixtures)||!Number.isSafeInteger(now)||limit<1||limit>1000)throw Error('INVALID_OU_SCREEN');
 const cache=new Map(),seen=new Set(),qualified=[];
 const counts={checked:0,insufficient:0,probabilityBelow:0,qualified:0,invalid:0};
 for(const f of fixtures){
  if(counts.checked>=limit)break;
  const fid=Number(f?.id),home=Number(f?.teams?.home?.id),away=Number(f?.teams?.away?.id),kickoff=f?.kickoff_ts;
  if(!id(fid)||seen.has(fid)||!id(home)||!id(away)||home===away||f?.status!=='scheduled'||!Number.isSafeInteger(kickoff)||kickoff<=now+300||kickoff>now+OU_POLICY.maxLookaheadSec){counts.invalid++;continue}
  seen.add(fid);counts.checked++;
  const hh=bttsLastMatches(db,home,kickoff,now,10),aa=bttsLastMatches(db,away,kickoff,now,10);
  if(hh.length<OU_POLICY.minHistory||aa.length<OU_POLICY.minHistory){counts.insufficient++;continue}
  const m=estimateOu25(hh,aa,leaguePrior(db,f.league?.id,kickoff,cache));
  if(m.state!=='QUALIFIED'){counts.probabilityBelow++;continue}
  counts.qualified++;
  qualified.push({fixture_id:fid,home_id:home,away_id:away,league_id:id(f.league?.id)?Number(f.league.id):0,
   league_name:String(f.league?.name??'').slice(0,180),home:String(f.teams.home.name??home).slice(0,180),
   away:String(f.teams.away.name??away).slice(0,180),kickoff,picked_at:now,observed:now,
   market:'O/U',...m,home_count:hh.length,away_count:aa.length,status:'PENDING',price:null,units:null});
 }
 return {mode:'OU_MODEL_ONLY_TEST',counts,qualified,providerCalls:0,policy:OU_POLICY};
}
export function initOu(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_pick_v1_test (fixture_id INTEGER PRIMARY KEY,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,league_id INTEGER NOT NULL,league_name TEXT NOT NULL,home TEXT NOT NULL,away TEXT NOT NULL,kickoff INTEGER NOT NULL,picked_at INTEGER NOT NULL,observed INTEGER NOT NULL,market TEXT NOT NULL DEFAULT 'O/U',pick TEXT NOT NULL CHECK(pick IN ('OVER_2.5','UNDER_2.5')),line REAL NOT NULL,probability REAL NOT NULL,over_probability REAL NOT NULL,lambda_home REAL NOT NULL,lambda_away REAL NOT NULL,expected_total REAL NOT NULL,home_count INTEGER NOT NULL,away_count INTEGER NOT NULL,price REAL,status TEXT NOT NULL DEFAULT 'PENDING',hg INTEGER,ag INTEGER,settled_at INTEGER,units REAL,model TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_pick_settle_v1 ON b46_ou_pick_v1_test(status,kickoff)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_event_v1_test (fixture_id INTEGER PRIMARY KEY,picked_at INTEGER NOT NULL,status TEXT NOT NULL,settled_at INTEGER,units REAL,revision INTEGER NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_snapshot_v1_test (id INTEGER PRIMARY KEY CHECK(id=1),total INTEGER NOT NULL DEFAULT 0,pending INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,push INTEGER NOT NULL DEFAULT 0,units REAL NOT NULL DEFAULT 0,priced_settled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_daily_v1_test (business_day TEXT PRIMARY KEY,selected INTEGER NOT NULL DEFAULT 0,settled INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,push INTEGER NOT NULL DEFAULT 0,units REAL NOT NULL DEFAULT 0,priced_settled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
 db.exec("INSERT OR IGNORE INTO b46_ou_snapshot_v1_test(id) VALUES(1)");
}
export function recordOu(db,report,now){
 if(!Array.isArray(report?.qualified)||!Number.isSafeInteger(now))throw Error('INVALID_OU_RECORD');
 let added=0,duplicate=0,rejected=0;
 db.transaction(()=>{for(const p of report.qualified){
  if(!id(p.fixture_id)||!id(p.home_id)||!id(p.away_id)||p.picked_at!==now||p.kickoff<=now||p.line!==2.5||!['OVER_2.5','UNDER_2.5'].includes(p.pick)||!num(p.probability)||p.probability<.64||p.probability>1||p.home_count<3||p.away_count<3||p.price!==null||p.model!==OU_MODEL){rejected++;continue}
  db.exec("INSERT INTO b46_ou_pick_v1_test(fixture_id,home_id,away_id,league_id,league_name,home,away,kickoff,picked_at,observed,pick,line,probability,over_probability,lambda_home,lambda_away,expected_total,home_count,away_count,model) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_id) DO NOTHING",
   p.fixture_id,p.home_id,p.away_id,p.league_id,p.league_name,p.home,p.away,p.kickoff,now,now,p.pick,2.5,p.probability,p.overProbability,p.lambdaHome,p.lambdaAway,p.expectedTotalGoals,p.home_count,p.away_count,OU_MODEL);
  const n=Number(get(db,'SELECT changes() AS n')[0]?.n??0);
  if(n===1)added++;else duplicate++;
 }});
 return {added,duplicate,rejected,providerCalls:0};
}
export function settleOu(db,now){
 if(!Number.isSafeInteger(now))throw Error('INVALID_OU_SETTLE');
 let settled=0;
 db.transaction(()=>{
  const q="SELECT p.fixture_id,p.pick,r.hg,r.ag FROM b46_ou_pick_v1_test p JOIN result_version r ON r.fixture_id=p.fixture_id AND r.home_id=p.home_id AND r.away_id=p.away_id WHERE p.status='PENDING' AND p.picked_at<r.kickoff AND r.kickoff<? AND r.status='finished' AND r.observed>r.kickoff AND r.observed<=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?)";
  for(const p of get(db,q,now,now,now)){
   const won=p.pick===((p.hg+p.ag)>=3?'OVER_2.5':'UNDER_2.5');
   db.exec("UPDATE b46_ou_pick_v1_test SET status=?,hg=?,ag=?,settled_at=?,units=NULL WHERE fixture_id=? AND status='PENDING'",won?'WIN':'LOSS',p.hg,p.ag,now,p.fixture_id);
   settled++;
  }
 });
 return {settled,providerCalls:0};
}
function eventDelta(db,e,sign,now){
 const pending=Number(e.status==='PENDING'),win=Number(e.status==='WIN'),loss=Number(e.status==='LOSS'),push=Number(e.status==='PUSH'),priced=Number(e.status!=='PENDING'&&num(e.units)),units=priced?e.units:0;
 db.exec("UPDATE b46_ou_snapshot_v1_test SET total=total+?,pending=pending+?,win=win+?,loss=loss+?,push=push+?,units=units+?,priced_settled=priced_settled+?,updated_at=? WHERE id=1",sign,sign*pending,sign*win,sign*loss,sign*push,sign*units,sign*priced,now);
 const day=londonAccountingWindow(e.picked_at).businessDay;
 db.exec("INSERT INTO b46_ou_daily_v1_test(business_day,selected,updated_at) VALUES(?,?,?) ON CONFLICT(business_day) DO UPDATE SET selected=selected+excluded.selected,updated_at=excluded.updated_at",day,sign,now);
 if(e.settled_at){
  const end=londonAccountingWindow(e.settled_at).businessDay;
  db.exec("INSERT INTO b46_ou_daily_v1_test(business_day,settled,win,loss,push,units,priced_settled,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(business_day) DO UPDATE SET settled=settled+excluded.settled,win=win+excluded.win,loss=loss+excluded.loss,push=push+excluded.push,units=units+excluded.units,priced_settled=priced_settled+excluded.priced_settled,updated_at=excluded.updated_at",end,sign,sign*win,sign*loss,sign*push,sign*units,sign*priced,now);
 }
}
export function syncOuSnapshot(db,now){
 if(!Number.isSafeInteger(now))throw Error('INVALID_OU_CLOCK');
 let processed=0;
 db.transaction(()=>{
  const q="SELECT p.fixture_id,p.picked_at,p.status,p.settled_at,p.units,e.picked_at old_picked_at,e.status old_status,e.settled_at old_settled_at,e.units old_units,e.revision old_revision FROM b46_ou_pick_v1_test p LEFT JOIN b46_ou_event_v1_test e ON e.fixture_id=p.fixture_id WHERE e.fixture_id IS NULL OR e.picked_at IS NOT p.picked_at OR e.status IS NOT p.status OR e.settled_at IS NOT p.settled_at OR e.units IS NOT p.units ORDER BY p.fixture_id LIMIT 1000";
  for(const p of get(db,q)){
   const prev=p.old_revision==null?null:{picked_at:p.old_picked_at,status:p.old_status,settled_at:p.old_settled_at,units:p.old_units};
   if(prev)eventDelta(db,prev,-1,now);
   eventDelta(db,p,1,now);
   db.exec("INSERT INTO b46_ou_event_v1_test(fixture_id,picked_at,status,settled_at,units,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET picked_at=excluded.picked_at,status=excluded.status,settled_at=excluded.settled_at,units=excluded.units,revision=revision+1",p.fixture_id,p.picked_at,p.status,p.settled_at,p.units,prev?p.old_revision+1:1);
   processed++;
  }
  const v=get(db,"SELECT total,pending,win,loss,push,priced_settled FROM b46_ou_snapshot_v1_test WHERE id=1")[0];
  if(v.total!==v.pending+v.win+v.loss+v.push||[v.total,v.pending,v.win,v.loss,v.push,v.priced_settled].some(x=>x<0))throw Error('OU_SNAPSHOT_INVARIANT');
 });
 return {processed,providerCalls:0};
}
export function readOuSnapshot(db,now){
 const s=get(db,"SELECT * FROM b46_ou_snapshot_v1_test WHERE id=1")[0];
 const win=Number(s.win||0),loss=Number(s.loss||0),priced=Number(s.priced_settled||0);
 const stats={total:s.total,pending:s.pending,win,loss,push:s.push,draw:s.push,settled:win+loss+s.push,winRate:win+loss?100*win/(win+loss):null,units:priced>0?Number(s.units):null,pricedSettled:priced};
 const window=londonAccountingWindow(now),today=window.businessDay;
 const day=get(db,'SELECT * FROM b46_ou_daily_v1_test WHERE business_day=?',today)[0],w=Number(day?.win||0),l=Number(day?.loss||0),p=Number(day?.push||0);
 const dailyBook={window,selected:{total:Number(day?.selected||0),pending:null},settled:{total:Number(day?.settled||0),win:w,loss:l,push:p,draw:p,winRate:w+l?100*w/(w+l):null,units:Number(day?.priced_settled||0)>0?Number(day.units):null},basis:'SETTLED_AT_FOR_WINRATE_AND_PL',model:'LONDON_06_SHARED_WITH_LIVE',source:'OU_SNAPSHOT_V1',providerCalls:0};
 const start=new Date(Date.parse(today+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
 const series=get(db,'SELECT * FROM b46_ou_daily_v1_test WHERE business_day>=? AND business_day<=? ORDER BY business_day',start,today);
 const dailySeries=series.map(r=>({date:r.business_day,selected:r.selected,settled:r.settled,win:r.win,loss:r.loss,draw:r.push,stakedUnits:null,netUnits:null,cumulativeUnits:null}));
 return {stats,dailyBook,dailySeries,source:'PERSISTED_OU_SNAPSHOT_V1',providerCalls:0,fullLedgerRecalculationOnRead:false};
}
export function readOuLedger(db,now){
 const data=readOuSnapshot(db,now);
 const q="SELECT fixture_id,home_id,away_id,league_id,league_name AS leagueName,home,away,kickoff,picked_at,observed,'O/U' AS market,pick,line,probability,over_probability AS overProbability,lambda_home AS lambdaHome,lambda_away AS lambdaAway,expected_total AS expectedTotalGoals,home_count,away_count,price,status,hg,ag,settled_at,units,model FROM b46_ou_pick_v1_test ORDER BY kickoff,fixture_id LIMIT 1000";
 const result=get(db,q);
 return {mode:'TEST_ONLY',market:'O/U',modelOnly:true,rows:result,stats:data.stats,publishedTest:result.length,providerCalls:0};
}
export function historicalOuBacktest(db,limit=350){
 if(!Number.isInteger(limit)||limit<50||limit>750)throw Error('INVALID_OU_BACKTEST_LIMIT');
 const q="SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT ?";
 const games=get(db,q,limit).sort((a,b)=>a.kickoff-b.kickoff),cache=new Map();
 const stats={examined:games.length,historyReady:0,qualified:0,win:0,loss:0,over:0,under:0,winRate:null};
 for(const g of games){
  const hh=historicalMatches(db,g.home_id,g.kickoff),aa=historicalMatches(db,g.away_id,g.kickoff);
  if(hh.length<3||aa.length<3)continue;
  stats.historyReady++;
  const m=estimateOu25(hh,aa,leaguePrior(db,g.league_id,g.kickoff,cache));
  if(m.state!=='QUALIFIED')continue;
  stats.qualified++;stats[m.pick==='OVER_2.5'?'over':'under']++;
  if((m.pick==='OVER_2.5')===((Number(g.hg)+Number(g.ag))>=3))stats.win++;else stats.loss++;
 }
 stats.winRate=stats.qualified?100*stats.win/stats.qualified:null;
 return {mode:'RETROSPECTIVE_GOALS_SIMULATION_NOT_ASOF_PRICE_BACKTEST',
  caveat:'Historical archive imported after matches; no proof of pre-kickoff availability or market odds. Do not claim tradable ROI.',
  stats,model:OU_MODEL,providerCalls:0,persistentChanges:0};
}

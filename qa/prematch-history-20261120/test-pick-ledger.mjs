// Test-only immutable 1X2 prediction ledger. No external calls.
export function initPickLedger(db){
 db.exec("CREATE TABLE IF NOT EXISTS test_pick_1x2 (fixture_id INTEGER PRIMARY KEY, home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, kickoff INTEGER NOT NULL, picked_at INTEGER NOT NULL, observed INTEGER NOT NULL, pick TEXT NOT NULL, price REAL NOT NULL, probability REAL NOT NULL, edge REAL NOT NULL, ev REAL NOT NULL, tier TEXT NOT NULL, home_count INTEGER NOT NULL, away_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', hg INTEGER, ag INTEGER, settled_at INTEGER, units REAL, model TEXT NOT NULL)");
}
const arr=(db,q,...a)=>Array.from(db.exec(q,...a));
const integer=x=>Number.isSafeInteger(x)&&x>0;
export function recordPicks(db,picks,now){
 if(!Array.isArray(picks)||picks.length>1000)throw Error('INVALID_PICKS');
 let added=0,duplicate=0,rejected=0;
 db.transaction(()=>{for(const p of picks){
 const id=Number(p.id),h=Number(p.homeId),a=Number(p.awayId);
 if(![id,h,a,p.kickoff,p.selectedAt,p.observed].every(integer)||h===a||p.selectedAt>now||p.selectedAt>=p.kickoff||p.observed>p.selectedAt||!['HOME_WIN','DRAW','AWAY_WIN'].includes(p.pick)||typeof p.home!=='string'||typeof p.away!=='string'||![p.price,p.probability,p.edge,p.ev].every(Number.isFinite)||p.price<=1||p.probability<0||p.probability>1||p.edge<.01||p.ev<.01||!Array.isArray(p.history)||p.history.length!==2||!p.history.every(n=>Number.isInteger(n)&&n>=0&&n<=10)||!['sparse','both_min3'].includes(p.tier)||p.model!=='market-anchored-1x2-v1'){rejected++;continue}
 const old=arr(db,'SELECT fixture_id FROM test_pick_1x2 WHERE fixture_id=?',id);if(old.length){duplicate++;continue}
 db.exec('INSERT INTO test_pick_1x2 (fixture_id,home_id,away_id,home,away,kickoff,picked_at,observed,pick,price,probability,edge,ev,tier,home_count,away_count,model) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,h,a,p.home,p.away,p.kickoff,p.selectedAt,p.observed,p.pick,p.price,p.probability,p.edge,p.ev,p.tier,...p.history,p.model);added++;
 }});return {added,duplicate,rejected}
}
export function settlePicks(db,now){
 let settled=0;
 db.transaction(()=>{const rows=arr(db,"SELECT p.*,r.hg AS result_hg,r.ag AS result_ag,r.observed AS result_observed FROM test_pick_1x2 p JOIN result_version r ON r.fixture_id=p.fixture_id AND r.home_id=p.home_id AND r.away_id=p.away_id AND r.kickoff=p.kickoff WHERE p.status='PENDING' AND p.kickoff<? AND r.status='finished' AND r.observed>p.kickoff AND r.observed<=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?)",now,now,now);
 for(const p of rows){const actual=p.result_hg>p.result_ag?'HOME_WIN':p.result_hg===p.result_ag?'DRAW':'AWAY_WIN',win=p.pick===actual;db.exec("UPDATE test_pick_1x2 SET status=?,hg=?,ag=?,settled_at=?,units=? WHERE fixture_id=? AND status='PENDING'",win?'WIN':'LOSS',p.result_hg,p.result_ag,now,win?p.price-1:-1,p.fixture_id);settled++}});
 return settled
}
export function ledger(db){
 const rows=arr(db,'SELECT * FROM test_pick_1x2 ORDER BY kickoff,fixture_id LIMIT 1000');
 const s=arr(db,"SELECT COUNT(*) AS total,COALESCE(SUM(status='PENDING'),0) AS pending,COALESCE(SUM(status='WIN'),0) AS win,COALESCE(SUM(status='LOSS'),0) AS loss,COALESCE(SUM(units),0) AS units FROM test_pick_1x2")[0];return {rows,stats:{...s,settled:s.win+s.loss,winRate:s.win+s.loss?100*s.win/(s.win+s.loss):null},mode:'TEST_ONLY',published:0}
}
export function picksFromBot(report,fixtures,now){
 const map=new Map(fixtures.map(f=>[String(f.id),f]));
 return report.rows.flatMap(r=>{const f=map.get(String(r.fixtureId)),m=r.oneX2?.metrics,s=m?.sides?.find(x=>x.signal===r.oneX2.signal&&x.passed);if(!f||f.kickoff_ts<=now||!s||m.method!=='market-anchored-1x2-v1')return [];return [{id:r.fixtureId,homeId:f.teams.home.id,awayId:f.teams.away.id,home:r.home,away:r.away,kickoff:f.kickoff_ts,selectedAt:now,observed:m.oddsObserved,pick:s.signal,price:s.price,probability:s.model,edge:s.edge,ev:s.ev,tier:m.evidenceTier,history:[r.homeCount,r.awayCount],model:m.method}]})
}

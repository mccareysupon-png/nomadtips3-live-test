import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {londonAccountingWindow,preMatchDailyBook} from './london-cutoff.mjs';
import {initPickLedger} from './test-pick-ledger.mjs';
const sec=s=>Math.floor(Date.parse(s)/1000);
test('Winter: London 06 = Bangkok 13, before boundary belongs prior cycle',()=>{
 const before=londonAccountingWindow(sec('2026-11-21T05:59:59Z'));const after=londonAccountingWindow(sec('2026-11-21T06:00:00Z'));
 assert.equal(before.businessDay,'2026-11-20');assert.equal(after.businessDay,'2026-11-21');assert.equal(after.begin,sec('2026-11-21T06:00:00Z'));assert.equal(after.thailandCutoffHour,13);
});
test('Summer: London 06 = Bangkok 12, DST transitions and no extra schedule',()=>{
 const before=londonAccountingWindow(sec('2026-06-21T04:59:59Z'));const after=londonAccountingWindow(sec('2026-06-21T05:00:00Z'));
 assert.equal(before.businessDay,'2026-06-20');assert.equal(after.businessDay,'2026-06-21');assert.equal(after.thailandCutoffHour,12);assert.equal(after.begin,sec('2026-06-21T05:00:00Z'));
 const march=londonAccountingWindow(sec('2026-03-29T05:00:00Z'));assert.equal(march.businessDay,'2026-03-29');assert.equal(march.begin,sec('2026-03-29T05:00:00Z'));
 const october=londonAccountingWindow(sec('2026-10-25T06:00:00Z'));assert.equal(october.businessDay,'2026-10-25');assert.equal(october.begin,sec('2026-10-25T06:00:00Z'));
});
test('Daily settlement uses settled time; carry old pending, never reset all-time',()=>{
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...a)=>{const st=sql.prepare(q);return st.columns().length?st.all(...a):st.run(...a)}};
 initPickLedger(db);
 const old=sec('2026-11-20T08:00:00Z'),newer=sec('2026-11-21T07:00:00Z');
 const insert=(id,picked,status,settled,units)=>db.exec('INSERT INTO test_pick_1x2 (fixture_id,home_id,away_id,home,away,kickoff,picked_at,observed,pick,price,probability,edge,ev,tier,home_count,away_count,status,settled_at,units,model) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,1,2,'Home','Away',newer+80000,picked,picked-60,'HOME_WIN',2.0,.58,.04,.16,'sparse',1,1,status,settled,units,'market-anchored-1x2-v1');
 insert(1,old,'PENDING',null,null);
 insert(2,old,'WIN',newer,1);
 insert(3,newer,'LOSS',newer,-1);
 const b=preMatchDailyBook(db,newer+60);
 assert.equal(b.window.businessDay,'2026-11-21');
 assert.deepEqual(b.selected,{total:1,pending:0});
 assert.deepEqual(b.settled,{total:2,win:1,loss:1,winRate:50,units:0});
 assert.equal(b.carriedPending,1);
 const c=preMatchDailyBook(db,sec('2026-11-22T06:00:00Z'));
 assert.equal(c.selected.total,0);assert.equal(c.settled.total,0);assert.equal(c.carriedPending,1);
});

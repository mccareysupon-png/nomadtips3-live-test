import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init} from './history.mjs';
import {initBttsHistory} from './btts-history-private.mjs';
import {evaluateBttsUltra} from './btts-ultra-shadow.mjs';
import {bttsTestHtml} from './btts-human-web.mjs';

function conn(){
 const sql=new DatabaseSync(':memory:');
 const db={exec:(q,...args)=>{
  const s=sql.prepare(q);
  return /^\s*(SELECT|WITH|PRAGMA)/i.test(q)?s.all(...args):(s.run(...args),[]);
 },transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(db);initBttsHistory(db);return db;
}
const current=300;
function fixture(i){
 return {id:900+i,status:'scheduled',kickoff_ts:2000+i,league:{id:10,name:i===0?'Thai League':'Other League'},
  teams:{home:{id:100+i,name:i===0?'Bangkok United':'Home '+i},away:{id:200+i,name:'Away '+i}}};
}
test('web UI is responsive and contains a visible BTTS explanation, search, pagination and clear test warning',()=>{
 assert.match(bttsTestHtml,/name="viewport"/);
 assert.match(bttsTestHtml,/BTTS · Both Teams to Score/);
 assert.match(bttsTestHtml,/TEST ONLY/);
 assert.match(bttsTestHtml,/Search team, league or fixture ID/);
 assert.match(bttsTestHtml,/3–10 matches per team accepted/);
 assert.match(bttsTestHtml,/btts-preview-data/);
 assert.match(bttsTestHtml,/No predictions are published/);
 assert.match(bttsTestHtml,/textContent/);
 assert.doesNotMatch(bttsTestHtml,/CLOUDFLARE_API_TOKEN|OWNER_SECRET|FIVEDOLLAR_API_KEY/);
});
test('page 1 and 2 expose genuine records with bounded 25-row page; no 1X2 modifications',()=>{
 const db=conn(),f=Array.from({length:27},(_,i)=>fixture(i));
 const first=evaluateBttsUltra(db,f,current,{},250,{page:1,filter:'ALL',q:''});
 assert.equal(first.preview.total,27);
 assert.equal(first.preview.pageSize,25);
 assert.equal(first.preview.pages,2);
 assert.equal(first.preview.rows.length,25);
 assert.equal(first.preview.rows[0].leagueName,'Thai League');
 assert.equal(first.preview.rows[0].homeHistory,0);
 assert.equal(first.preview.rows[0].awayHistory,0);
 assert.equal(first.preview.rows[0].status,'WAITING_HISTORY');
 assert.equal(first.preview.rows[0].probabilityYes,null);
 assert.equal(first.preview.rows[0].oddsYes,null);
 assert.equal(first.providerCalls,0);assert.equal(first.published,0);
 const second=evaluateBttsUltra(db,f,current,{},250,{page:2,filter:'ALL',q:''});
 assert.equal(second.preview.rows.length,2);
 assert.equal(second.preview.page,2);
});
test('search returns actual name/league and status filters do not invent odds or publish signals',()=>{
 const db=conn(),f=Array.from({length:27},(_,i)=>fixture(i));
 const named=evaluateBttsUltra(db,f,current,{},250,{page:1,filter:'ALL',q:'Bangkok United'});
 assert.equal(named.preview.total,1);
 assert.equal(named.preview.rows[0].home,'Bangkok United');
 const league=evaluateBttsUltra(db,f,current,{},250,{page:1,filter:'ALL',q:'Thai League'});
 assert.equal(league.preview.total,1);
 const need=evaluateBttsUltra(db,f,current,{},250,{page:1,filter:'WAITING_HISTORY'});
 assert.equal(need.preview.total,27);
 const none=evaluateBttsUltra(db,f,current,{},250,{page:1,filter:'QUALIFIED_TEST'});
 assert.equal(none.preview.total,0);
 assert.equal(none.preview.pages,1);
 assert.deepEqual(none.preview.rows,[]);
});
test('malformed filters and page are safely constrained',()=>{
 const db=conn(),f=[fixture(0),fixture(1)];
 const r=evaluateBttsUltra(db,f,current,{},250,{page:'-9999',filter:'UNKNOWN',q:'x'.repeat(1000)});
 assert.equal(r.preview.page,1);
 assert.equal(r.preview.filter,'ALL');
 assert.equal(r.preview.query.length,80);
 assert.equal(r.preview.total,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sharedFtLastMatches,sharedFtShadowCoverage} from './shared-ft-shadow-bridge-v1.mjs';
const create=()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE result_version(fixture_id INTEGER, observed INTEGER, league_id INTEGER,kickoff INTEGER,home_id INTEGER,away_id INTEGER,status TEXT,hg INTEGER,ag INTEGER);
 CREATE TABLE b46_ou_target_history_ft_v1(fixture_id INTEGER,observed INTEGER,league_id INTEGER,kickoff INTEGER,home_id INTEGER,away_id INTEGER,hg INTEGER,ag INTEGER);`);
 return {db:{exec:(q,...a)=>sql.prepare(q).all(...a)},sql};
};
test('dedupe by fixture id, canonical precedence, count 1X2 and over/under without writes',()=>{
 const {db,sql}=create();
 for(let i=1;i<=5;i++){
  sql.prepare('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)').run(i,100,4,100+i,11,100+i,'finished',2,1);
  sql.prepare('INSERT INTO b46_ou_target_history_ft_v1 VALUES(?,?,?,?,?,?,?,?)').run(i,110,4,100+i,11,100+i,0,0);
 }
 for(let i=6;i<=10;i++)sql.prepare('INSERT INTO b46_ou_target_history_ft_v1 VALUES(?,?,?,?,?,?,?,?)').run(i,110,4,100+i,11,100+i,0,0);
 for(let i=20;i<=29;i++)sql.prepare('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)').run(i,100,4,100+i,22,100+i,'finished',1,0);
 const a=sharedFtLastMatches(db,11,200,150);
 assert.equal(a.length,10);assert.equal(new Set(a.map(x=>x.fixtureId)).size,10);
 assert.equal(a.find(x=>x.fixtureId===1)?.source,'CANONICAL_1X2');
 assert.equal(a.find(x=>x.fixtureId===1)?.over25,true);
 const c=sharedFtShadowCoverage(db,11,22,200,150);
 assert.equal(c.bothReady10,true);assert.deepEqual(c.home.sources,{canonical:5,targeted:5});
 assert.equal(c.home.over25Rate,0.5);assert.equal(c.providerCalls,0);assert.equal(c.writes,0);
 sql.close();
});
test('never use future observations, future kickoffs, unfinished or invalid scores',()=>{
 const {db,sql}=create();
 sql.prepare('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)').run(1,300,4,101,11,22,'finished',2,1);
 sql.prepare('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)').run(2,100,4,201,11,22,'finished',2,1);
 sql.prepare('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)').run(3,100,4,103,11,22,'unknown',null,null);
 sql.prepare('INSERT INTO b46_ou_target_history_ft_v1 VALUES(?,?,?,?,?,?,?,?)').run(4,300,4,104,11,22,2,1);
 assert.equal(sharedFtLastMatches(db,11,200,150).length,0);
 assert.throws(()=>sharedFtLastMatches(db,11,200,201),/SHARED_FT_INVALID_QUERY/);
 sql.close();
});

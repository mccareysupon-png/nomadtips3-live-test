import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreLeagueNamesFromOriginalRows,enrichLeagueNamesOnMonitor} from './league-name-cache.mjs';

const row={fixture_id:203564245,home_id:100,away_id:200,price:2.5,pick:'HOME_WIN',status:'PENDING'};
const raw={fixtureId:203564245,homeId:100,awayId:200,leagueId:421,leagueName:'England League One'};
test('old absent-HUB PENDING card recovers exact original league and retains pick',()=>{
 const prior=JSON.stringify(row);
 const x=restoreLeagueNamesFromOriginalRows({},[row],[raw],{});
 assert.equal(x.stats.restored,1);
 assert.equal(x.registry['203564245'].name,'England League One');
 const monitor=enrichLeagueNamesOnMonitor({monitor:{203564245:{phase:'NOT_IN_HUB',label:'Schedule unverified'}}},[row],[],x.registry);
 assert.equal(monitor.monitor['203564245'].leagueName,'England League One');
 assert.equal(monitor.monitor['203564245'].phase,'NOT_IN_HUB');
 assert.equal(JSON.stringify(row),prior);
});
test('wrong teams for same fixture ID are never assigned names',()=>{
 const x=restoreLeagueNamesFromOriginalRows({},[row],[{...raw,awayId:999}],{});
 assert.equal(x.stats.restored,0);assert.equal(x.stats.mismatch,1);
});
test('wrong historical league ID is rejected even with identical teams',()=>{
 const x=restoreLeagueNamesFromOriginalRows({},[row],[raw],{'203564245':422});
 assert.equal(x.stats.mismatch,1);assert.equal(x.stats.restored,0);
});
test('verified historical league ID permits a matching name',()=>{
 const x=restoreLeagueNamesFromOriginalRows({},[row],[raw],{'203564245':421});
 assert.equal(x.stats.restored,1);
});
test('invalid or fabricated league names are rejected',()=>{
 for(const name of ['',null,'unknown','pre-match','League unavailable']){
  const x=restoreLeagueNamesFromOriginalRows({},[row],[{...raw,leagueName:name}]);
  assert.equal(x.stats.invalid,1);assert.equal(x.stats.restored,0);
 }
});
test('does not overwrite a previously verified different name',()=>{
 const existing={'203564245':{fixtureId:'203564245',homeId:'100',awayId:'200',name:'England League One'}};
 const x=restoreLeagueNamesFromOriginalRows(existing,[row],[{...raw,leagueName:'Different Competition'}]);
 assert.equal(x.stats.conflicts,1);assert.equal(x.stats.restored,0);
 assert.deepEqual(x.registry,existing);
});
test('idempotent repeat does not alter stored original league',()=>{
 const one=restoreLeagueNamesFromOriginalRows({},[row],[raw]);
 const two=restoreLeagueNamesFromOriginalRows(one.registry,[row],[raw]);
 assert.equal(two.stats.existing,1);assert.equal(two.stats.restored,0);
 assert.deepEqual(two.registry,one.registry);
});
test('duplicate fixture names in batch require review rather than override',()=>{
 const x=restoreLeagueNamesFromOriginalRows({},[row],[raw,{...raw,leagueName:'Another League'}]);
 assert.equal(x.stats.conflicts,1);
});
test('unselected fixture cannot modify ledger-associated league registry',()=>{
 const x=restoreLeagueNamesFromOriginalRows({},[row],[{...raw,fixtureId:33333}]);
 assert.equal(x.stats.unmatched,1);assert.equal(x.stats.restored,0);
});

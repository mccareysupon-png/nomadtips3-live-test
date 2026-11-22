import test from 'node:test';
import assert from 'node:assert/strict';
import {leagueNameRegistryFromFixtures,enrichLeagueNamesOnMonitor} from './league-name-cache.mjs';
const picked={fixture_id:98765,home_id:1001,away_id:2002,status:'PENDING',pick:'HOME_WIN',price:2.14};
const fixture={id:98765,teams:{home:{id:1001},away:{id:2002}},league:{id:121,name:'English Premier League'}};

test('Upcoming league name matches selected fixture and two team IDs',()=>{
 const x=leagueNameRegistryFromFixtures({},[picked],[fixture]);
 assert.equal(x['98765'].name,'English Premier League');
 assert.equal(x['98765'].homeId,'1001');
 assert.equal(x['98765'].awayId,'2002');
});
test('When HUB fixture disappears after kickoff, saved league name survives FT and other statuses',()=>{
 const saved=leagueNameRegistryFromFixtures({},[picked],[fixture]);
 const gone=leagueNameRegistryFromFixtures(saved,[{...picked,status:'WIN'}],[]);
 const hub={source:'NOMAD_343_HUB_CACHED_SNAPSHOT',providerCalls:0,monitor:{98765:{phase:'NOT_IN_HUB',label:'Schedule unverified'}}};
 const out=enrichLeagueNamesOnMonitor(hub,[{...picked,status:'WIN'}],[],gone);
 assert.equal(out.monitor[98765].leagueName,'English Premier League');
 assert.equal(out.monitor[98765].phase,'NOT_IN_HUB');
 assert.equal(out.monitor[98765].label,'Schedule unverified');
 assert.equal(out.providerCalls,0);
 assert.equal(hub.monitor[98765].leagueName,undefined);
});
test('Verified HUB league and score take precedence, not overwritten by saved name',()=>{
 const known=leagueNameRegistryFromFixtures({},[picked],[fixture]);
 const hub={monitor:{98765:{phase:'FINISHED',score:{home:2,away:1},leagueName:'Verified New League'}}};
 const out=enrichLeagueNamesOnMonitor(hub,[picked],[],known);
 assert.deepEqual(out.monitor[98765],hub.monitor[98765]);
});
test('Different fixture or different home/away ID never supplies a league',()=>{
 for(const wrong of [{...fixture,id:22222},{...fixture,teams:{home:{id:2002},away:{id:1001}}},{...fixture,teams:{home:{id:1001},away:{id:2222}}}]){
  assert.deepEqual(leagueNameRegistryFromFixtures({},[picked],[wrong]),{});
  const preview=enrichLeagueNamesOnMonitor({monitor:{98765:{phase:'PENDING'}}},[picked],[wrong],{});
  assert.equal(preview.monitor[98765].leagueName,undefined);
 }
});
test('Invalid missing league names do not turn into a guess',()=>{
 for(const name of [null,undefined,'',' ', 'League unavailable','League pending verification','PRE-MATCH']){
  const out=leagueNameRegistryFromFixtures({},[picked],[{...fixture,league:{id:121,name}}]);
  assert.deepEqual(out,{});
 }
});
test('Unmatched old archive entries are removed; metadata never leaks between fixture IDs',()=>{
 const old={'98765':{fixtureId:'98765',homeId:'1001',awayId:'2002',name:'English Premier League'},
  '44':{fixtureId:'44',homeId:'11',awayId:'12',name:'Another League'}};
 assert.deepEqual(Object.keys(leagueNameRegistryFromFixtures(old,[picked],[])),['98765']);
});
test('Ledger rows and statistics remain byte-for-byte untouched by viewer enrichment',()=>{
 const rows=[picked], before=JSON.stringify(rows);
 const monitor={monitor:{98765:{phase:'PENDING',score:null}}};
 const result=enrichLeagueNamesOnMonitor(monitor,rows,[fixture],{});
 assert.equal(result.monitor[98765].leagueName,'English Premier League');
 assert.equal(result.monitor[98765].phase,'PENDING');
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(monitor.monitor[98765],{phase:'PENDING',score:null});
});

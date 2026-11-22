import test from 'node:test';
import assert from 'node:assert/strict';
import {leagueCatalogFromCachedHub,enrichLeagueNamesOnMonitor} from './league-name-cache.mjs';
import {mergeStoredPrematch} from './stored-prematch-feed.mjs';

const now=1795280000;
const picked={fixture_id:2280615858,home_id:501,away_id:502,status:'WIN'};
const fixture=(id,leagueId,name,home=501,away=502)=>({
 fixtureId:id,league:{id:leagueId,name},home:{id:home},away:{id:away}
});
const stored=(id,leagueId,name,home=501,away=502)=>({
 id:String(id),teams:{home:{id:home,name:'Home'},away:{id:away,name:'Away'}},
 league:{id:leagueId,name},kickoff_ts:now+7200,status:'scheduled',
 storedHub1x2:{bookmaker:'5usd-hub',observed:now-100,prices:{'1X2_HOME':1.8,'1X2_DRAW':3.4,'1X2_AWAY':4.4}}
});
test('all HUB cached league names are collected even without 1X2 odds',()=>{
 const snapshot={ok:true,cacheOnly:true,fixtures:[fixture(2280615858,88,'Australia A-League'),fixture(99,108,'Liga MX',9,10)]};
 const a=leagueCatalogFromCachedHub({},snapshot,[]);
 assert.deepEqual(a.catalog,{'88':'Australia A-League','108':'Liga MX'});
 assert.equal(a.observedLeagueIds,2);
});
test('finished old pick absent from HUB can use authoritative archive league ID',()=>{
 const catalog=leagueCatalogFromCachedHub({}, {ok:true,cacheOnly:true,fixtures:[fixture(999,88,'Australia A-League',9,10)]},[]).catalog;
 const before={monitor:{2280615858:{phase:'NOT_IN_HUB',label:'Schedule unverified',score:null}}};
 const actual=enrichLeagueNamesOnMonitor(before,[picked],[],{},catalog,{'2280615858':88});
 assert.equal(actual.monitor['2280615858'].leagueName,'Australia A-League');
 assert.equal(actual.monitor['2280615858'].phase,'NOT_IN_HUB');
 assert.equal(JSON.stringify(before),JSON.stringify({monitor:{2280615858:{phase:'NOT_IN_HUB',label:'Schedule unverified',score:null}}}));
});
test('same fixture ID wrong team identities cannot grant fixture league name',()=>{
 const result=enrichLeagueNamesOnMonitor({monitor:{}},[picked],[stored(2280615858,88,'Australia A-League',333,444)],{},{}, {});
 assert.equal(result.monitor['2280615858'],undefined);
});
test('do not invent league name with missing verified ID',()=>{
 const result=enrichLeagueNamesOnMonitor({monitor:{'2280615858':{phase:'PENDING'}}},[picked],[],{}, {'88':'Australia A-League'},{});
 assert.equal(result.monitor['2280615858'].leagueName,undefined);
});
test('HUB clash within same league ID cannot infer a name',()=>{
 const old={'88':'Old League'};
 const snapshot={ok:true,cacheOnly:true,fixtures:[fixture(1,88,'Australia A-League'),fixture(2,88,'Another League')]};
 const x=leagueCatalogFromCachedHub(old,snapshot,[]);
 assert.equal(x.catalog['88'],undefined);
 assert.deepEqual(x.conflicts,['88']);
});
test('blank new league name cannot erase valid existing stored name',()=>{
 const old=stored(2280615858,88,'Australia A-League'),newer=stored(2280615858,88,' ');
 const merged=mergeStoredPrematch([old],[newer],now);
 assert.equal(merged.fixtures[0].league.name,'Australia A-League');
 assert.equal(merged.fixtures[0].storedHub1x2.prices['1X2_HOME'],1.8);
});
test('new league ID does not inherit name from unrelated previous league',()=>{
 const merged=mergeStoredPrematch([stored(2280615858,88,'Australia A-League')],[stored(2280615858,999,' ')],now);
 assert.equal(merged.fixtures[0].league.id,999);
 assert.equal(merged.fixtures[0].league.name,' ');
});
test('verified exact fixture name remains higher precedence than historical dictionary',()=>{
 const m=enrichLeagueNamesOnMonitor({monitor:{2280615858:{phase:'LIVE',leagueName:'Australia A-League',minute:44}}},[picked],[],{},{'88':'Wrong league'},{'2280615858':88});
 assert.equal(m.monitor['2280615858'].leagueName,'Australia A-League');
 assert.equal(m.monitor['2280615858'].minute,44);
});

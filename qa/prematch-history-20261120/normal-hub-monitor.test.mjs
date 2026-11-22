import test from 'node:test';
import assert from 'node:assert/strict';
import {matchNormalHub} from './normal-hub-monitor.mjs';
const now=1795222200,kickoff=1795201200,observer=1795221174228;
const row={fixture_id:203962150,home_id:4852,away_id:1114,kickoff,picked_at:kickoff-600,status:'PENDING'};
const fixture={fixtureId:'203962150',home:{id:'4852'},away:{id:'1114'},kickoffUtc:new Date(kickoff*1000).toISOString(),league:{id:'121'},status:'finished',statusCode:'full',boardState:'finished',minute:null,goals:{home:3,away:0}};
const s=(f=[fixture])=>({ok:true,cacheOnly:true,fetchedAt:observer,stale:false,fixtures:f});
test('normal full-time result from matching cached fixture only',()=>{
 const r=matchNormalHub(s(),[row],now);
 assert.equal(r.finals.length,1);
 assert.equal(r.finals[0].kickoff_ts,kickoff);
 assert.equal(r.monitor[203962150].phase,'FINISHED');
 assert.equal(r.monitor[203962150].scheduleChanged,false);
 assert.equal(r.providerCalls,0);
});
test('changed kickoff is a schedule revision, not identity mismatch',()=>{
 const shifted=kickoff+3600,r=matchNormalHub(s([{...fixture,kickoffUtc:new Date(shifted*1000).toISOString()}]),[row],now);
 assert.equal(r.finals.length,1);
 assert.equal(r.finals[0].kickoff_ts,shifted);
 assert.equal(r.monitor[203962150].lockedKickoff,kickoff);
 assert.equal(r.monitor[203962150].scheduledKickoff,shifted);
 assert.equal(r.monitor[203962150].scheduleChanged,true);
 assert.equal(r.details.rescheduled,1);
 assert.equal(r.details.mismatch,0);
});
test('revised kickoff in the future stays pending; never infer live',()=>{
 const shifted=now+3600,changed={...fixture,kickoffUtc:new Date(shifted*1000).toISOString(),status:'scheduled',statusCode:'',boardState:'scheduled',goals:{home:null,away:null}};
 const r=matchNormalHub(s([changed]),[row],now);
 assert.equal(r.monitor[203962150].phase,'PENDING');
 assert.equal(r.monitor[203962150].scheduledKickoff,shifted);
 assert.equal(r.finals.length,0);
});
test('unverified new kickoff before selection cannot settle a locked pick',()=>{
 const moved=kickoff-900;const r=matchNormalHub(s([{...fixture,kickoffUtc:new Date(moved*1000).toISOString()}]),[row],now);
 assert.equal(r.finals.length,0);
 assert.equal(r.monitor[203962150].phase,'FINISHED');
});
test('in-play and half-time remain live, not automatically settled',()=>{
 const f={...fixture,status:'in_play',statusCode:'half',boardState:'live',minute:null,goals:{home:2,away:2}};
 let r=matchNormalHub(s([f]),[row],now);
 assert.equal(r.monitor[203962150].phase,'LIVE');assert.equal(r.monitor[203962150].label,'HT');assert.equal(r.finals.length,0);
 r=matchNormalHub(s([{...f,statusCode:'2h',minute:63}]),[row],now);
 assert.equal(r.monitor[203962150].label,"63'");
});
test('explicit postponement/cancellation/abandonment/unknown are not settled',()=>{
 for(const [status,phase] of [['postponed','POSTPONED'],['cancelled','CANCELLED'],['abandoned','ABANDONED'],['unknown','UNKNOWN']]){
  const r=matchNormalHub(s([{...fixture,status,statusCode:'',boardState:'scheduled'}]),[row],now);
  assert.equal(r.monitor[203962150].phase,phase);
  assert.equal(r.finals.length,0);
 }
});
test('missing HUB fixture is UNKNOWN availability, never cancellation',()=>{
 const r=matchNormalHub(s([]),[row],now);
 assert.equal(r.monitor[203962150].phase,'NOT_IN_HUB');assert.equal(r.finals.length,0);
});
test('team identity changes are rejected even if fixture ID agrees',()=>{
 for(const diff of [{away:{id:'9'}},{home:{id:'9'}},{kickoffUtc:'INVALID'}]){
  const r=matchNormalHub(s([{...fixture,...diff}]),[row],now);
  assert.equal(r.details.mismatch,1);assert.equal(r.finals.length,0);
 }
});
test('full-time status, score, selection time required',()=>{
 for(const diff of [{statusCode:'pen'},{status:'in_play'},{boardState:'live'},{goals:{home:null,away:0}}])
  assert.equal(matchNormalHub(s([{...fixture,...diff}]),[row],now).finals.length,0);
});
test('existing decided fixture cannot settle twice',()=>assert.equal(matchNormalHub(s(),[{...row,status:'WIN'}],now).finals.length,0));
test('invalid feed and stale future observation rejected',()=>{
 assert.throws(()=>matchNormalHub({...s(),cacheOnly:false},[row],now));
 assert.throws(()=>matchNormalHub({...s(),fetchedAt:1795990000000},[row],now));
});

test('league name is forwarded from verified matched HUB fixture without any new provider calls',()=>{
 const named={...fixture,league:{...fixture.league,name:'Premier League'}};
 const r=matchNormalHub(s([named]),[row],now);
 assert.equal(r.monitor[203962150].leagueName,'Premier League');
 assert.equal(r.finals.length,1);
 assert.equal(r.finals[0].league.id,121);
 assert.equal(r.providerCalls,0);
});
test('unverified identity never exposes a league name',()=>{
 const named={...fixture,league:{...fixture.league,name:'Premier League'}};
 for(const f of [{...named,away:{id:'999'}},{...named,fixtureId:'999'}, {...named,home:{id:'999'}}]){
  const r=matchNormalHub(s([f]),[row],now);
  assert.equal(r.monitor[203962150]?.leagueName,undefined);
  assert.equal(r.finals.length,0);
 }
});
test('missing or blank league name remains null while status processing stays intact',()=>{
 for(const name of [undefined,'','  ']){
  const f={...fixture,league:{id:'121',name}};
  const r=matchNormalHub(s([f]),[row],now);
  assert.equal(r.monitor[203962150].leagueName,null);
  assert.equal(r.monitor[203962150].phase,'FINISHED');
  assert.equal(r.finals.length,1);
 }
});

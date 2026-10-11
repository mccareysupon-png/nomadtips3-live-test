import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/event-flow-icons.js',import.meta.url),'utf8'),context);
const {kind,label,merge,group,icon}=context.Ball46EventIcons;
test('recognizes actual football event categories',()=>{
  const cases=[['Goal','goal'],['Corner kick','corner'],['Yellow Card','yellow'],
    ['Red Card','red'],['Penalty','penalty'],['Substitution','sub'],
    ['Goal disallowed','var'],['VAR','var'],['Card','card'],
    ['Card','yellow','Yellow Card'],['Card','red','Red Card']];
  for(const [type,want,detail] of cases)assert.equal(kind({type,detail}),want,type);
});
test('goal and corner have meaningful pictograms',()=>{
  assert.equal(icon('goal'),'⚽');assert.equal(icon('corner'),'🚩');
});
test('history timestamp is approximate, but live timestamps are exact',()=>{
  const src=[{minute:31,type:'Corner',side:'home'}];
  const realtime=[{minute:31,type:'Corner',side:'home',detail:'Corner kick'}];
  const arr=merge(src,realtime,e=>e.side);
  assert.equal(arr.length,1);assert.equal(arr[0].approximate,false);
  const stale=merge(src,[],e=>e.side);
  assert.equal(stale.length,1);assert.equal(stale[0].approximate,true);
  assert.match(label(stale[0]),/approximate minute/);
});
test('events remain in their actual minute and own team side',()=>{
  const values=merge([],[{minute:27,type:'Goal',side:'away'},
    {minute:12,type:'Corner',side:'home'}],e=>e.side);
  assert.equal(values[0].minute,12);assert.equal(values[0].side,'home');
  assert.equal(values[1].minute,27);assert.equal(values[1].side,'away');
});
test('mobile compacts close events without silently discarding them',()=>{
  const arr=[{minute:26,type:'Corner',side:'home'},{minute:27,type:'Goal',side:'home'},
    {minute:27,type:'Yellow Card',side:'away'}];
  const markers=group(arr,90,true);
  assert.equal(markers.length,3,'different kinds never share a pin');
  assert.equal(markers.filter(x=>x.side==='home').length,2);
  assert.equal(markers.find(x=>x.kind==='goal').primary.minute,27);
  assert.equal(markers.find(x=>x.kind==='corner').primary.minute,26);
});
test('discard impossible event minutes and empty source safely',()=>{
  assert.equal(merge([{minute:-1,type:'Goal'}, {minute:999,type:'Goal'}],[],()=>null).length,0);
  assert.equal(group(null,90).length,0);
});
test('event descriptions include minute, side, and true details',()=>{
  assert.match(label({minute:78,type:'Yellow card',side:'away'},'HOME FC','AWAY FC'),/78'.*Yellow card.*AWAY FC/);
});

test('Single goal at 21 minutes is not doubled by a delayed 22-minute snapshot',()=>{
  const history=[{minute:22,type:'Goal',side:'home'}];
  const live=[{minute:21,type:'Goal',side:'home',detail:'Normal Goal'}];
  const events=merge(history,live,e=>e.side,{home:1,away:0});
  assert.equal(events.length,1);
  assert.equal(events[0].minute,21);
  assert.equal(events[0].approximate,false);
  assert.equal(group(events,90,false).filter(x=>x.kind==='goal').length,1);
});
test('Unidentified real-feed side matches a confirmed snapshot team',()=>{
  const events=merge(
    [{minute:30,type:'Goal',side:'home'}],
    [{minute:29,type:'Goal'}],
    e=>e.side,
    {home:1,away:0});
  assert.equal(events.length,1);
  assert.equal(events[0].minute,29);
  assert.equal(events[0].side,'home');
});
test('Real goals for opposing teams or different event types remain separate',()=>{
  const events=merge(
    [{minute:22,type:'Goal',side:'away'},{minute:22,type:'Corner',side:'home'}],
    [{minute:21,type:'Goal',side:'home'}],
    e=>e.side,
    {home:1,away:1});
  assert.equal(events.filter(e=>kind(e)==='goal').length,2);
  assert.equal(events.filter(e=>kind(e)==='corner').length,1);
  assert.equal(group(events,90,true).length,3);
});
test('Two actual same-minute goals with different IDs remain distinct',()=>{
  const events=merge(
    [{minute:30,type:'Goal',side:'home'},{minute:30,type:'Goal',side:'home'}],
    [{minute:30,type:'Goal',side:'home',eventId:'goal-a'},
      {minute:30,type:'Goal',side:'home',eventId:'goal-b'}],
    e=>e.side,{home:2,away:0});
  assert.equal(events.length,2);
  assert.ok(events.every(e=>!e.approximate));
});
test('Identical provider goal rows do not produce two football icons',()=>{
  const events=merge([],[
    {minute:44,type:'Goal',side:'home',detail:'Normal Goal'},
    {minute:44,type:'Goal',side:'home',detail:'Normal Goal'}
  ],e=>e.side,{home:1,away:0});
  assert.equal(events.length,1);
});
test('Stale reconstructed goal cannot exceed latest real score',()=>{
  const events=merge(
    [{minute:31,type:'Goal',side:'home'}],
    [{minute:21,type:'Goal',side:'home'}],
    e=>e.side,{home:1,away:0});
  assert.equal(events.filter(e=>kind(e)==='goal').length,1);
  assert.equal(events[0].minute,21);
});
test('Historical events supplement only events absent from the live feed',()=>{
  const events=merge(
    [{minute:9,type:'Goal',side:'home'},{minute:41,type:'Goal',side:'home'}],
    [{minute:40,type:'Goal',side:'home'}],
    e=>e.side,{home:2,away:0});
  assert.deepEqual(Array.from(events.map(e=>e.minute)),[9,40]);
});
test('Event markers remain separate from Signal detections',()=>{
  assert.match(fs.readFileSync(new URL('../public/member.js',import.meta.url),'utf8'),
    /const events=iconLib[\s\S]*?iconLib\.merge\(historyEvents,liveEvents,e=>eventSide\(e,featured\),featured\?\.score\)/);
});

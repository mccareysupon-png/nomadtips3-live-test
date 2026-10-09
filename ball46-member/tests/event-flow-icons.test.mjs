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
  assert.equal(markers.length,2);
  const home=markers.find(x=>x.side==='home');
  assert.equal(home.events.length,2);
  assert.equal(home.primary.minute,27);
  assert.equal(home.kind,'goal');
});
test('discard impossible event minutes and empty source safely',()=>{
  assert.equal(merge([{minute:-1,type:'Goal'}, {minute:999,type:'Goal'}],[],()=>null).length,0);
  assert.equal(group(null,90).length,0);
});
test('event descriptions include minute, side, and true details',()=>{
  assert.match(label({minute:78,type:'Yellow card',side:'away'},'HOME FC','AWAY FC'),/78'.*Yellow card.*AWAY FC/);
});

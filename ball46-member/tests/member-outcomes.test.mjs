import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeMemberOutcome,countMemberOutcomes} from '../src/member-outcomes.js';
const server=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const member=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');

test('A raw LIVE signal remains LIVE despite Engine status PENDING',()=>{
 assert.equal(normalizeMemberOutcome('LIVE','PENDING'),'LIVE');
 assert.equal(normalizeMemberOutcome('PENDING','PENDING'),'PENDING');
 assert.equal(normalizeMemberOutcome('WIN','SETTLED'),'WIN');
});
test('Unresolved and void are not silently counted as pending',()=>{
 assert.equal(normalizeMemberOutcome('VOID','SETTLED'),'VOID');
 assert.equal(normalizeMemberOutcome('UNKNOWN','UNRESOLVED'),'UNRESOLVED');
 assert.equal(normalizeMemberOutcome(null,'UNRESOLVED'),'UNRESOLVED');
 assert.equal(normalizeMemberOutcome(null,'PENDING'),'PENDING');
});
test('Live-source mix reconciles to PENDING 17 + LIVE 8, not PENDING 25',()=>{
 const rows=[
  ...Array.from({length:17},()=>({result:'WIN'})),
  ...Array.from({length:8},()=>({result:'LOSS'})),
  ...Array.from({length:2},()=>({result:'PUSH'})),
  ...Array.from({length:2},()=>({result:'HALF_LOSS'})),
  ...Array.from({length:8},()=>({result:normalizeMemberOutcome('LIVE','PENDING')})),
  ...Array.from({length:17},()=>({result:'PENDING'}))
 ];
 const c=countMemberOutcomes(rows);
 assert.equal(c.signals,54);
 assert.equal(c.pending,17);assert.equal(c.live,8);
 assert.equal(c.win,17);assert.equal(c.loss,8);
 assert.equal(c.push,2);assert.equal(c.halfLoss,2);
 assert.equal(Object.entries(c).filter(([k])=>k!=='signals').reduce((sum,[,v])=>sum+v,0),54);
});
test('Status totals account for all terminal and non-terminal result types',()=>{
 const rows=['PENDING','LIVE','VOID','UNRESOLVED','HALF_WIN','HALF_LOSS','PUSH']
  .map(result=>({result}));
 const s=countMemberOutcomes(rows);
 assert.equal(s.signals,7);
 for(const [key,count] of Object.entries({pending:1,live:1,void:1,unresolved:1,halfWin:1,halfLoss:1,push:1}))
  assert.equal(s[key],count);
});
test('Member UI renders distinct LIVE and PENDING cards and result badges',()=>{
 assert.match(server,/normalizeMemberOutcome\(row\?\.result,row\?\.status\)/);
 assert.match(server,/countMemberOutcomes\(scoped\)/);
 assert.match(member,/\['PENDING',s\.pending,'pending'\]/);
 assert.match(member,/\['LIVE',s\.live\|\|0,'live'\]/);
 assert.match(member,/if\(result==='LIVE'\) return 'live'/);
 assert.match(html,/member-pending-live1/);
});

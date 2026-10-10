import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalMemberSignals} from '../src/signal-identity.js';
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const member=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');

test('First issued Signal is canonical for a fixture-market despite racing Engine scans',()=>{
 const t=Date.now();
 const entries=[
  {id:'new',fixtureId:'202523459',sourceMarket:'ft_under',createdAt:t+2000,odds:1.99,line:1.75},
  {id:'old',fixtureId:'202523459',sourceMarket:'ft_under',createdAt:t,odds:1.99,line:1.75},
  {id:'ah',fixtureId:'202523459',sourceMarket:'ft_ah',createdAt:t+3000},
  {id:'other',fixtureId:'another',sourceMarket:'ft_under',createdAt:t+4000}
 ];
 const {canonical,duplicateSignalIds}=canonicalMemberSignals(entries);
 assert.equal(canonical.length,3);
 assert.ok(canonical.some(x=>x.id==='old'));
 assert.ok(!canonical.some(x=>x.id==='new'));
 assert.deepEqual(duplicateSignalIds,['new']);
 assert.ok(canonical.some(x=>x.id==='ah'));
});
test('Do not collapse different markets of one match or distinct fixtures',()=>{
 const rows=[{id:'A',fixtureId:'1',sourceMarket:'ft_corner_over',createdAt:1},
             {id:'B',fixtureId:'1',sourceMarket:'ft_corner_ah',createdAt:2},
             {id:'C',fixtureId:'2',sourceMarket:'ft_corner_over',createdAt:3}];
 const x=canonicalMemberSignals(rows);
 assert.equal(x.canonical.length,3);
 assert.deepEqual(x.duplicateSignalIds,[]);
});
test('Member deduplication changes display and summary only, not immutable Engine Ledger',()=>{
 assert.match(worker,/canonicalMemberSignals\(normalized\)/);
 assert.match(worker,/suppressedDuplicateCount:duplicateSignalIds\.length/);
 assert.match(worker,/duplicateSignalIds,/);
 assert.match(member,/s\.fixtureId===fixtureId && s\.id!==state\.expandedSignalId/);
 assert.match(member,/if\(alternatives\.children\.length\) host\.append\(alternatives\)/);
 assert.match(html,/20261010-canonical-signal1/);
});

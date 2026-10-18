import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedName,nameSimilarity,proposeVerifiedMappings} from '../cross-source-fixture-mapper.mjs';
const canon=(id='5D-1',patch={})=>({fixtureId:id,home:'Al Hilal FC',away:'Al Nassr',
 league:'Saudi Pro League',kickoffUtc:'2026-10-18T14:00:00Z',...patch});
const goaloo=(id='G-1',patch={})=>({sourceFixtureId:id,home:'Al-Hilal',away:'Al Nassr FC',
 league:'Saudi Pro League',kickoffUtc:'2026-10-18T14:05:00Z',...patch});
const map=(a,b,options={})=>proposeVerifiedMappings(a,b,options);
test('accent, hyphen, FC and common abbreviation are normalized',()=>{
 assert.equal(normalizedName('Ál–Hilal F.C.'),'al hilal f c');
 assert.equal(nameSimilarity('Al-Hilal FC','Al Hilal'),1);
 assert.equal(nameSimilarity('Manchester Utd','Manchester United'),1);
});
test('same team/league with +5 minute kickoff yields one mapping',()=>{
 const r=map([canon()],[goaloo()]);
 assert.equal(r.approved.length,1);
 assert.equal(r.approved[0].sourceFixtureId,'G-1');
 assert.equal(r.approved[0].kickoffDeltaMinutes,5);
 assert.equal(r.hasProductionWrites,false);
});
test('different league name never auto maps without vetted alias',()=>{
 const p=goaloo('G-1',{league:'Saudi Professional League'});
 assert.equal(map([canon()],[p]).approved.length,0);
 const r=map([canon()],[p],{approvedLeagues:{'Saudi Professional League':'Saudi Pro League'}});
 assert.equal(r.approved.length,1);
});
test('we can match minor team text variants and approved explicit rename',()=>{
 const p=goaloo('G-2',{home:'Al Hilaal',away:'Al-Nassr'});
 const r=map([canon()],[p]);
 assert.equal(r.approved.length,1);
 const x=goaloo('G-2',{home:'Blue Riyadh FC'});
 assert.equal(map([canon()],[x]).approved.length,0);
 assert.equal(map([canon()],[x],{approvedTeamAliases:{'Blue Riyadh FC':'Al Hilal FC'}}).approved.length,1);
});
test('not matching only one team even with same time',()=>{
 const r=map([canon()],[goaloo('G-3',{away:'Al Ittihad'})]);
 assert.equal(r.approved.length,0);
});
test('swapped home-away must HOLD',()=>{
 const r=map([canon()],[goaloo('G-4',{home:'Al Nassr',away:'Al Hilal FC'})]);
 assert.equal(r.approved.length,0);
});
test('kickoff more than 15 minutes away must HOLD',()=>{
 const r=map([canon()],[goaloo('G-4',{kickoffUtc:'2026-10-18T14:24:00Z'})]);
 assert.equal(r.approved.length,0);
});
test('kickoff without confirmed UTC timezone must HOLD',()=>{
 const r=map([canon()],[goaloo('G-4',{kickoffUtc:'2026-10-18 14:00:00'})]);
 assert.equal(r.approved.length,0);
});
test('two identical fixture candidates must both HOLD, not arbitrarily take first',()=>{
 const r=map([canon('5D-1'),canon('5D-2')],[goaloo()]);
 assert.equal(r.approved.length,0);
 assert.equal(r.review.filter(x=>x.reason==='AMBIGUOUS_OR_NONMUTUAL').length,2);
});
test('two Goaloo games competing for same 5USD fixture must HOLD',()=>{
 const r=map([canon()],[goaloo('G-1'),goaloo('G-2')]);
 assert.equal(r.approved.length,0);
});
test('two distinct, independent fixtures match one-to-one',()=>{
 const r=map([
  canon('5D-1'),canon('5D-2',{home:'Bangkok United',away:'Buriram United',league:'Thai League',
  kickoffUtc:'2026-10-18T11:00:00Z'})
 ],[
  goaloo('G-1'),goaloo('G-2',{home:'Bangkok Utd',away:'Buriram Utd',league:'Thai League',
  kickoffUtc:'2026-10-18T11:01:00Z'})
 ]);
 assert.equal(r.approved.length,2);
 assert.equal(new Set(r.approved.map(x=>x.sourceFixtureId)).size,2);
});
test('women cannot be mapped onto men team accidentally',()=>{
 const r=map([canon('5D-W',{home:'Arsenal Women',away:'Chelsea Women',league:'WSL'})],
  [goaloo('G-M',{home:'Arsenal',away:'Chelsea',league:'WSL'})]);
 assert.equal(r.approved.length,0);
});
test('under-21 and senior teams must never map despite similar names',()=>{
 const r=map([canon('5D-Y',{home:'Man City U21',away:'Liverpool U21',league:'Premier League 2'})],
  [goaloo('G-S',{home:'Man City',away:'Liverpool',league:'Premier League 2'})]);
 assert.equal(r.approved.length,0);
});
test('corners not needed and not included in identity gate',()=>{
 const a=canon(),p=goaloo();
 assert.equal(Object.hasOwn(a,'corners'),false);
 assert.equal(Object.hasOwn(p,'corners'),false);
 assert.equal(map([a],[p]).approved.length,1);
});
test('source-neutral: fourth provider maps with same strict rules',()=>{
 const r=map([canon()],[{...goaloo(),sourceFixtureId:'FOURTH-22'}],{source:'fourth'});
 assert.equal(r.approved[0].source,'fourth');
});
test('scores alone cannot override wrong league or kickoff',()=>{
 const c=canon('5D-1',{score:{home:2,away:0}}),
  p=goaloo('G-1',{league:'Wrong League',score:{home:2,away:0}});
 assert.equal(map([c],[p]).approved.length,0);
});

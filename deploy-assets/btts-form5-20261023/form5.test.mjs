import test from 'node:test';
import assert from 'node:assert/strict';
import {pickForm5,evaluateBTTSForm5,settleBTTSForm5,aggregateBTTS} from './form5.mjs';
const KO='2026-10-24T12:00:00Z', AT='2026-10-23T12:00:00Z';
const home=(id,k=0)=>({fixtureId:String(100+k),status:'finished',kickoffUtc:new Date(Date.parse(KO)-(k+1)*86400000).toISOString(),teams:{home:{id},away:{id:'R'+k}},goals:{home:1,away:1}});
const away=(id,k=0)=>({fixtureId:String(200+k),status:'finished',kickoffUtc:new Date(Date.parse(KO)-(k+1)*86400000).toISOString(),teams:{home:{id:'Q'+k},away:{id}},goals:{home:1,away:1}});
const five=(id,side,f)=>Array.from({length:5},(_,i)=>{let x=side==='home'?home(id,i):away(id,i);return f?f(x,i):x});
const future=()=>({fixtureId:'555',home:{id:'H',name:'Home'},away:{id:'A',name:'Away'},kickoffUtc:KO,status:'scheduled'});
test('YES when both scored >=4 and conceded >=3',()=>{
 const s=evaluateBTTSForm5(future(),five('H','home'),five('A','away'),AT);
 assert.equal(s.selection,'YES');assert.equal(s.market,'ft_btts_yes');assert.equal(s.status,'PENDING');assert.equal(s.homeForm.fixtures.length,5);
});
test('NO when any team scored 0 in >=3 games',()=>{
 const h=five('H','home',(x,i)=>({...x,goals:{home:i<3?0:1,away:1}}));
 const s=evaluateBTTSForm5(future(),h,five('A','away'),AT);assert.equal(s.selection,'NO');assert.equal(s.market,'ft_btts_no');
});
test('NO SIGNAL for neutral form',()=>{
 const h=five('H','home',(x,i)=>({...x,goals:{home:i<2?0:1,away:i<2?0:1}}));
 const s=evaluateBTTSForm5(future(),h,five('A','away'),AT);assert.equal(s.status,'NO_SIGNAL');assert.equal(s.reason,'NEUTRAL');
});
test('5 past games required, no guessing missing results',()=>{
 const s=evaluateBTTSForm5(future(),five('H','home').slice(0,4),five('A','away'),AT);assert.equal(s.status,'NO_SIGNAL');assert.equal(s.reason,'HOME_INSUFFICIENT_FINISHED_HISTORY');
});
test('exclude future results and kickoff-match leakage',()=>{
 const hs=five('H','home');hs[0].kickoffUtc=KO;
 const s=evaluateBTTSForm5(future(),hs,five('A','away'),AT);assert.equal(s.status,'NO_SIGNAL');
});
test('exclude canceled, delayed, no final, and incomplete scores',()=>{
 const hs=five('H','home');hs[0].status='postponed';hs[1].goals.home=null;
 const p=pickForm5('H',hs,KO);assert.equal(p.ok,false);assert.equal(p.observed,3);
});
test('exclude wrong team and duplicate fixtures',()=>{
 const hs=[...five('H','home'),...five('H','home'),away('other',20)];
 const p=pickForm5('H',hs,KO);assert.equal(p.ok,true);assert.equal(p.fixtures.length,5);assert.equal(new Set(p.fixtures.map(x=>x.fixtureId)).size,5);
});
test('block predictions after kickoff',()=>{
 const s=evaluateBTTSForm5(future(),five('H','home'),five('A','away'),'2026-10-24T12:01:00Z');assert.equal(s.reason,'KICKOFF_ALREADY_STARTED');
});
test('settle YES WIN only if each scored at FT',()=>{
 const s=evaluateBTTSForm5(future(),five('H','home'),five('A','away'),AT);
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'finished',goals:{home:2,away:1}}).result,'WIN');
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'finished',goals:{home:0,away:1}}).result,'LOSS');
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'live',goals:{home:2,away:1}}).ok,false);
});
test('settle NO WIN only if at least one team clean sheet',()=>{
 const h=five('H','home',(x,i)=>({...x,goals:{home:i<3?0:1,away:1}}));
 const s=evaluateBTTSForm5(future(),h,five('A','away'),AT);
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'finished',goals:{home:0,away:1}}).result,'WIN');
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'finished',goals:{home:2,away:1}}).result,'LOSS');
});
test('reject stale fixture ID, not-final, absent FT score',()=>{
 const s=evaluateBTTSForm5(future(),five('H','home'),five('A','away'),AT);
 assert.equal(settleBTTSForm5(s,{fixtureId:'other',status:'finished',goals:{home:1,away:1}}).ok,false);
 assert.equal(settleBTTSForm5(s,{fixtureId:'555',status:'finished',goals:{home:1,away:null}}).ok,false);
});
test('winrate from settled only with zero safe and separated market',()=>{
 const rows=[{market:'ft_btts_yes',status:'SETTLED',result:'WIN'},{market:'ft_btts_yes',status:'SETTLED',result:'LOSS'}, {market:'ft_btts_no',status:'SETTLED',result:'WIN'},{market:'ft_btts_no',status:'PENDING',result:null}];
 assert.deepEqual(aggregateBTTS(rows),{settled:3,win:2,loss:1,winRate:66.7,pending:1,byMarket:{ft_btts_yes:2,ft_btts_no:1}});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalooBet365RunOdds,evaluateGoalooBet365Quote,applyGoalooBet365Fallback,countGoalooBet365FallbackCandidates} from '../src/goaloo-bet365-fallback.js';

const gates=(market=false)=>[['MINUTE',true,''],['CORE STATS',true,''],['REAL MARKET',market,''],['REAL PRICE AGE',market,''],['MARKET / ODDS',market,''],['MOMENTUM',true,''],['EVIDENCE',true,''],['GOAL GAP',true,''],['RED CARD',true,''],['SOURCE',true,'']];
const match=()=>({sourceMatchId:'3061002',home:'Home FC',away:'Away FC',league:'Test',minute:67,score:{home:1,away:1},kickoffUtc:'2026-08-24T00:00:00Z',engine:{side:'HOME',gates:gates(false),momentum:66,evidence:{sot:1},dailyBlocked:false},realMarket:{source:'1xbet',status:'ERROR',error:'ODDS_API_HTTP_429'},odds:{asianHandicap:null}});
const config={ahMin:-5,ahMax:5,oddsMin:1.5,oddsMax:3,confirmationRounds:1,signalLimitEnabled:false,maxSignalsPerDay:10};

test('parses Goaloo Bet365 HOME AH and converts HK odds to decimal',()=>{
  const q=parseGoalooBet365RunOdds('3061002!0.88,-1,0.94!2.1,3.2,3.4!0.91,2.5,0.95$').get('3061002');
  assert.equal(q.providerCompanyId,8);assert.equal(q.providerName,'Bet365');
  assert.deepEqual(q.asianHandicap,{home:1.88,line:-1,away:1.94,linePerspective:'HOME',raw:{home:0.88,line:-1,away:0.94}});
});

test('AWAY selection inverts only the HOME line',()=>{
  const m=match();m.engine.side='AWAY';
  const q=parseGoalooBet365RunOdds('3061002!0.88,-0.25,0.94!$').get('3061002');
  const e=evaluateGoalooBet365Quote(m,q,config);
  assert.equal(e.passed,true);assert.equal(e.rawHomeLine,-0.25);assert.equal(e.selectedLine,0.25);assert.equal(e.selectedOdds,1.94);
});

test('fallback never replaces a primary market that already passed',()=>{
  const m=match();m.engine.gates=gates(true);
  const latest={matches:[m]},history=[],quotes=parseGoalooBet365RunOdds('3061002!0.88,-0.25,0.94!$');
  assert.equal(countGoalooBet365FallbackCandidates(latest,history,config),0);
  const out=applyGoalooBet365Fallback({latest,config,history,quotes,fallbackStreaks:{},at:'2026-08-24T01:00:00Z'});
  assert.equal(out.attempted,0);assert.equal(history.length,0);assert.equal(m.realMarket.source,'1xbet');
});

test('fallback locks Bet365 Goaloo price with immutable entry score metadata',()=>{
  const m=match(),latest={matches:[m]},history=[],fallbackStreaks={};
  const quotes=parseGoalooBet365RunOdds('3061002!0.61,0.25,0.63!$');
  assert.equal(countGoalooBet365FallbackCandidates(latest,history,config),1);
  const out=applyGoalooBet365Fallback({latest,config,history,quotes,fallbackStreaks,at:'2026-08-24T01:00:00Z'});
  assert.equal(out.newSignals,1);assert.equal(history.length,1);
  assert.equal(history[0].bookmaker,'Bet365 (Goaloo)');assert.equal(history[0].pricingSource,'GOALOO_BET365_FALLBACK');
  assert.deepEqual(history[0].entryScore,{home:1,away:1});assert.equal(history[0].entryMinute,67);
  assert.equal(history[0].selectedLine,0.25);assert.equal(history[0].odds,1.61);
  assert.equal(m.currentAh.provider,'Bet365 (Goaloo)');assert.equal(m.realMarket.fallbackFrom.status,'ERROR');
});

test('fallback rejects an out-of-range Bet365 price and stays fail-closed',()=>{
  const m=match(),latest={matches:[m]},history=[];
  const quotes=parseGoalooBet365RunOdds('3061002!0.10,0.25,0.12!$');
  const out=applyGoalooBet365Fallback({latest,config,history,quotes,fallbackStreaks:{},at:'2026-08-24T01:00:00Z'});
  assert.equal(out.newSignals,0);assert.equal(out.rejected.odds,1);assert.equal(history.length,0);assert.equal(m.realMarket.status,'ERROR');
});

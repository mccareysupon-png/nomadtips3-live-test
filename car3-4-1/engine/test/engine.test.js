import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,evaluateBase,evaluateFinal} from '../src/detector.js';
import {parseAsianHandicap,teamSimilarity} from '../src/real-market.js';
import {settleSignal,summarizeHistory} from '../src/settlement.js';

const match={schema:'nomadtips3.live-match.v1',source:{provider:'GOALOO',matchId:'100',collectedAt:new Date().toISOString()},match:{id:'goaloo:100',league:'Demo League',home:'Home FC',away:'Away United',kickoff:'2026-08-20 01:00:00'},state:{status:'LIVE',minute:65},score:{home:0,away:1},stats:{possession:{home:56,away:44},attacks:{home:80,away:60},dangerousAttacks:{home:45,away:25},shots:{home:12,away:6},shotsOnTarget:{home:5,away:2},corners:{home:6,away:2},yellowCards:{home:1,away:1},redCards:{home:0,away:0}},quality:{coreStatsComplete:true,warnings:[]}};
const baseline={at:'2026-08-20T00:00:00Z',matches:[{...match,state:{status:'LIVE',minute:54},stats:{...match.stats,dangerousAttacks:{home:40,away:24},shots:{home:10,away:6},shotsOnTarget:{home:4,away:2},corners:{home:5,away:2}}}]};
const market=(confidence=.95)=>({status:'MATCH',matchConfidence:confidence,marketAgeSeconds:10,ah:{line:1,home:1.55,away:2.2,bookmaker:'1xbet',updatedAt:new Date().toISOString()}});

test('config locks AH and one confirmation round',()=>{const c=normalizeConfig({market:'OU',confirmationRounds:8});assert.equal(c.market,'AH');assert.equal(c.confirmationRounds,1);});
test('base detector passes strong HOME evidence',()=>{const r=evaluateBase(match,normalizeConfig({momentumMin:50}),[baseline]);assert.equal(r.side,'HOME');assert.equal(r.pass,true);assert.ok(r.evidence.dangerous>=1);});
test('final detector accepts fresh high-confidence real market',()=>{const cfg=normalizeConfig({side:'HOME',momentumMin:50,ahMin:1,oddsMin:1.4,matchConfidenceMin:85});const r=evaluateFinal(match,cfg,[baseline],market(.95));assert.equal(r.decision,'SIGNAL');assert.equal(r.selectedLine,1);assert.equal(r.odds,1.55);assert.equal(r.matchConfidencePct,95);});
test('final detector blocks weak Goaloo-to-1xBet mapping',()=>{const cfg=normalizeConfig({side:'HOME',momentumMin:50,ahMin:1,oddsMin:1.4,matchConfidenceMin:85});const r=evaluateFinal(match,cfg,[baseline],market(.70));assert.notEqual(r.decision,'SIGNAL');assert.equal(r.gates.find(g=>g[0]==='MARKET MATCH')[1],false);});
test('1xBet spread parser chooses balanced live line',()=>{const p={bookmakers:{'1xbet':[{name:'Spread',updatedAt:'2026-08-20T00:00:00Z',odds:[{hdp:1,home:1.52,away:2.3},{hdp:.75,home:1.91,away:1.93}]}]}};const ah=parseAsianHandicap(p);assert.equal(ah.line,.75);assert.equal(ah.home,1.91);});
test('team similarity tolerates FC suffix',()=>{assert.ok(teamSimilarity('Riverside FC','Riverside')>.9);});
test('live AH settles on post-entry goals and quarter split',()=>{const record={selectedSide:'HOME',entryScore:{home:0,away:1},selectedLine:1.25,line:1.25,odds:1.6};const s=settleSignal(record,{home:1,away:2},'2026-08-20T02:00:00Z');assert.equal(s.settlementResult,'FULL_WIN');assert.equal(s.resultGroup,'WIN');});
test('missing entry score is VOID not full-match fallback',()=>{const s=settleSignal({selectedSide:'HOME',selectedLine:1,odds:1.6},{home:1,away:2});assert.equal(s.resultGroup,'VOID');assert.equal(s.settlementBasis,'MISSING_ENTRY_SCORE');});
test('summary separates win/loss/draw/pending',()=>{const rows=[{settledAt:'x',resultGroup:'WIN',odds:1.5,settlementNetUnits:.5},{settledAt:'x',resultGroup:'LOSS',odds:1.5,settlementNetUnits:-1},{resultGroup:'PENDING'}];const s=summarizeHistory(rows);assert.equal(s.total,3);assert.equal(s.pending,1);assert.equal(s.win,1);assert.equal(s.loss,1);});

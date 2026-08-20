import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIndex,parseDetail} from '../src/goaloo.js';
import {normalizeGoalooMatch,summarizeQuality} from '../src/normalizer.js';

test('parseIndex extracts live match seed without detector logic',()=>{
  const row=Array(29).fill(null);
  row[0]=12345;row[1]=1;row[4]='Home FC';row[5]='Away FC';row[6]='2026-08-20 00:00:00';row[7]='2026-08-20 01:02:00';row[8]=1;row[9]=1;row[10]=0;row[13]=0;row[14]=0;row[15]=1;row[16]=2;row[21]=1;row[25]=2.5;row[27]=5;row[28]=3;
  const source=`B[1]=[1,null,"Demo League"];\nA[0]=${JSON.stringify(row)};`;
  const parsed=parseIndex(source);
  assert.equal(parsed.matchCount,1);
  assert.equal(parsed.live.length,1);
  assert.equal(parsed.live[0].id,'12345');
  assert.equal(parsed.live[0].league,'Demo League');
  assert.equal(parsed.live[0].minute,62);
  assert.deepEqual(parsed.live[0].score,{home:1,away:0});
  assert.equal(parsed.live[0].ahLine,1);
});

test('parseDetail extracts core statistics and keeps market values as hints only',()=>{
  const seed={id:'12345',league:'Demo League',leagueId:1,home:'Home FC',away:'Away FC',kickoff:'2026-08-20 00:00:00',minute:62,status:'LIVE',score:{home:1,away:0},redCards:{home:0,away:0},yellowCards:{home:1,away:2},ahLine:1,overUnderLine:2.5,corners:{home:5,away:3}};
  const html='<html><head><title>Home FC vs Away FC Live Scores</title></head><body>55 Possession 45 80 Attack 60 44 Dangerous Attack 28 12 Shots 7 5 Shots On Goal 2 5 Corner Kicks 3 1 Yellow Cards 2 0 Red Cards 0</body></html>';
  const detail=parseDetail(seed,html,'2026-08-20T01:02:03.000Z');
  assert.equal(detail.coreStatsComplete,true);
  assert.deepEqual(detail.stats.possession,{home:55,away:45});
  assert.deepEqual(detail.stats.shots_on_target,{home:5,away:2});
  assert.equal(detail.marketHints.asianHandicapLine,1);
});

test('normalizer produces source-independent schema and quality summary',()=>{
  const raw={sourceMatchId:'9',league:'Demo',leagueId:1,home:'A',away:'B',kickoff:null,minute:70,status:'LIVE',score:{home:0,away:1},stats:{possession:{home:55,away:45},attacks:{home:80,away:60},dangerous_attacks:{home:40,away:25},shots:{home:10,away:6},shots_on_target:{home:4,away:2},corners:{home:5,away:3},yellow_cards:{home:1,away:2},red_cards:{home:0,away:0}},marketHints:{asianHandicapLine:1,overUnderLine:2.5},warnings:[],collectedAt:'2026-08-20T01:00:00.000Z'};
  const normalized=normalizeGoalooMatch(raw);
  assert.equal(normalized.schema,'nomadtips3.live-match.v1');
  assert.equal(normalized.source.provider,'GOALOO');
  assert.equal(normalized.quality.coreStatsComplete,true);
  assert.equal(normalized.stats.dangerousAttacks.home,40);
  assert.deepEqual(summarizeQuality([normalized]),{total:1,coreStatsReady:1,minuteReady:1,warningCount:0,coreStatsReadyPct:100});
});

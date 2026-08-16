import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignalRecord, settleRecord, evaluateMatch, normalizeConfig} from '../src/index.js';

test('signal clock and entry score come from one snapshot',()=>{
  const match={id:'1',home:'Home',away:'Away',league:'L',elapsedSeconds:3997,minute:66,sourceClock:'2026-08-16 10:06:37',sourceStart:'2026-08-16 09:00:00',score:{home:1,away:0}};
  const evaluation={selectedTeam:'Home',side:'HOME',rawLine:-.5,selectedLine:-.5,odds:1.95,momentum:68,evidence:{dangerous:3},gates:{minute:true},market:'AH'};
  const r=buildSignalRecord(match,evaluation,'snap-1','2026-08-16T10:06:37Z');
  assert.equal(r.signalElapsedSeconds,3997);
  assert.equal(r.entryMinute,66);
  assert.deepEqual(r.entryScore,{home:1,away:0});
  assert.equal(r.snapshotId,'snap-1');
});

test('away AH line is selected-team perspective',()=>{
  const config=normalizeConfig({side:'AWAY',market:'AH',minuteMin:60,minuteMax:80,oddsMin:1.7,ahMin:-5,momentumMin:1,attackEvidenceEnabled:false,requireCoreStats:false});
  const match={home:'H',away:'A',minute:66,score:{home:1,away:0},redCards:{home:0,away:0},stats:{},odds:{asianHandicap:{line:-1.5,home:1.91,away:1.95}}};
  const e=evaluateMatch(match,config,null);
  assert.equal(e.selectedLine,1.5);
  assert.equal(e.odds,1.95);
});

test('live AH settlement ignores goals before entry',()=>{
  const record={market:'AH',selectedSide:'AWAY',selectedLine:1,entryScore:{home:1,away:0}};
  assert.deepEqual(settleRecord(record,{home:2,away:0}),{result:'DRAW',resultDetail:'PUSH'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG_SCHEMA_VERSION,DEFAULT_CONFIG} from '../src/config.js';
import {evaluateSide} from '../src/detector.js';

test('K Ultra Selective v1 defaults stay intentionally selective',()=>{
  assert.equal(CONFIG_SCHEMA_VERSION,34103);
  assert.equal(DEFAULT_CONFIG.minuteFrom,55);
  assert.equal(DEFAULT_CONFIG.minuteTo,80);
  assert.equal(DEFAULT_CONFIG.rollingWindowMinutes,8);
  assert.equal(DEFAULT_CONFIG.scoreDifferenceFilterEnabled,true);
  assert.equal(DEFAULT_CONFIG.maxScoreDifference,1);
  assert.equal(DEFAULT_CONFIG.attackWeight,1);
  assert.equal(DEFAULT_CONFIG.dangerousAttackWeight,2.5);
  assert.equal(DEFAULT_CONFIG.homePressureShareMinimum,62);
  assert.equal(DEFAULT_CONFIG.trendConditionsRequired,3);
  assert.equal(DEFAULT_CONFIG.evidenceMode,'ALL');
  assert.equal(DEFAULT_CONFIG.oddsMinimum,1.45);
  assert.equal(DEFAULT_CONFIG.oddsMaximumEnabled,true);
  assert.equal(DEFAULT_CONFIG.oddsMaximum,2.10);
  assert.equal(DEFAULT_CONFIG.maximumPriceAgeSeconds,30);
  assert.equal(DEFAULT_CONFIG.oneSignalPerMatch,true);
});

function rolling(corner=1){
  const conditions={pressureTrend:true,pressureShare:true,matchTempoTrend:true};
  return {
    available:true,
    sides:{home:{pressureShare:70,conditions,passedCount:3}},
    recent:{delta:{shotsOn:{home:1},shotsOff:{home:1},corners:{home:corner}}},
  };
}

test('K Ultra Selective v1 requires every enabled event evidence',()=>{
  const base={minute:60,score:{home:0,away:0}};
  const pass=evaluateSide({...base,rolling:rolling(1)},DEFAULT_CONFIG,null,Date.now(),'home');
  assert.equal(pass.detectionPassed,true);
  assert.equal(pass.evidence.passed,true);
  assert.equal(pass.evidence.passedCount,3);

  const reject=evaluateSide({...base,rolling:rolling(0)},DEFAULT_CONFIG,null,Date.now(),'home');
  assert.equal(reject.detectionPassed,false);
  assert.equal(reject.evidence.passed,false);
  assert.equal(reject.evidence.passedCount,2);
});

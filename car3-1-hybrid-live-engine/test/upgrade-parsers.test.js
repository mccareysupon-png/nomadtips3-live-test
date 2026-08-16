import test from 'node:test';import assert from 'node:assert/strict';
import {parseRunOdds,parseDetailEvents,parseDetailInStats,mergeCoreStats,deriveActivity} from '../worker/src/upgrade.js';

test('live odds parses AH 1X2 OU',()=>{const x=parseRunOdds('123!0.80,-0.25,1.05!1.72,3.40,4.90!0.90,2.5,0.95$').get('123');assert.equal(x.asianHandicap.home,1.8);assert.equal(x.asianHandicap.line,-.25);assert.equal(x.asianHandicap.away,2.05);assert.equal(x.oneXtwo.home,1.72);assert.equal(x.overUnder.over,1.9);});
test('detail events keep requested id and leave unverified codes generic',()=>{const m=parseDetailEvents('rq[0]="123^0^1^55^A^^^^0";rq[1]="123^1^7^41^B^^^^0";',new Set(['123']));assert.equal(m.get('123')[0].type,'EVENT 7');assert.equal(m.get('123')[1].type,'GOAL');});

test('Goaloo detailIn maps confirmed core statistic IDs from real public payload',()=>{
  const source="var tT_f=new Object();\r\ntT_f[2930884]=[[0,'3','5',38,62],[1,'0','1',0,100],[2,'1','2',33,67],[4,'8','13',38,62],[5,'5','3',62,38],[6,'111','125',47,53],[7,'47','73',39,61],[8,'3','10',23,77],[11,'51%','49%',51,49],[12,'54%','46%',54,46]];\r\ntT_f[9999999]=[[0,'1','2',33,67]];";
  const m=parseDetailInStats(source,new Set(['2930884']));
  assert.equal(m.has('9999999'),false);
  assert.deepEqual(m.get('2930884'),{
    corners:{home:3,away:5},
    shots:{home:8,away:13},
    shots_on_target:{home:5,away:3},
    attacks:{home:111,away:125},
    dangerous_attacks:{home:47,away:73},
    possession:{home:51,away:49}
  });
});

test('core stats fallback fills only missing values and preserves real zero/base values',()=>{
  const detail={corners:{home:3,away:5},shots:{home:8,away:13},shots_on_target:{home:5,away:3},attacks:{home:111,away:125},dangerous_attacks:{home:47,away:73},possession:{home:51,away:49}};
  const match={
    stats:{
      possession:{home:null,away:null},
      attacks:{home:null,away:null},
      dangerous_attacks:{home:null,away:null},
      shots:{home:0,away:0},
      shots_on_target:{home:null,away:null},
      corners:{home:9,away:9}
    },
    coreStatsComplete:false,
    warnings:['CORE_STATS_INCOMPLETE','KEEP_ME']
  };
  const merged=mergeCoreStats(match,detail);
  assert.equal(merged.complete,true);
  assert.deepEqual(match.stats.shots,{home:0,away:0});
  assert.deepEqual(match.stats.corners,{home:9,away:9});
  assert.deepEqual(match.stats.attacks,{home:111,away:125});
  assert.deepEqual(match.stats.dangerous_attacks,{home:47,away:73});
  assert.deepEqual(match.stats.shots_on_target,{home:5,away:3});
  assert.deepEqual(match.stats.possession,{home:51,away:49});
  assert.deepEqual(match.warnings,['KEEP_ME']);
  assert.ok(merged.filled.includes('attacks.home'));
  assert.equal(merged.filled.includes('shots.home'),false);
});

test('partial detailIn data cannot falsely mark core stats complete',()=>{
  const match={stats:{possession:{home:null,away:null},attacks:{home:null,away:null},dangerous_attacks:{home:null,away:null},shots:{home:null,away:null},shots_on_target:{home:null,away:null},corners:{home:2,away:1}},coreStatsComplete:false};
  const merged=mergeCoreStats(match,{attacks:{home:10,away:8}});
  assert.equal(merged.complete,false);
  assert.equal(match.coreStatsComplete,false);
});

test('activity prioritizes goal',()=>{const p={score:{home:0,away:0},stats:{red_cards:{home:0,away:0},yellow_cards:{home:0,away:0},corners:{home:0,away:0},shots_on_target:{home:0,away:0},shots:{home:0,away:0},dangerous_attacks:{home:0,away:0},attacks:{home:0,away:0},possession:{home:50,away:50}}},c={score:{home:1,away:0},stats:{...p.stats,shots:{home:1,away:0},possession:{home:60,away:40}}};assert.equal(deriveActivity(c,p).type,'GOAL');});

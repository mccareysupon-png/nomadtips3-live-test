import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLiveIndex,parseStats} from '../src/index.js';

test('detailIn extracts SOT, validated Shot Off and possession',()=>{
  const source="var tT_f=new Object();\r\ntT_f[2930884]=[[0,'3','5',38,62],[4,'8','13',38,62],[5,'5','3',62,38],[6,'111','125',47,53],[7,'47','73',39,61],[8,'3','10',23,77],[11,'51%','49%',51,49]];";
  const row=parseStats(source).get('2930884');
  assert.deepEqual(row.shots_on_target,{home:5,away:3});
  assert.deepEqual(row.shots_off_target,{home:3,away:10});
  assert.deepEqual(row.possession,{home:51,away:49});
  assert.equal(row.provenance.shots_off_target,'GOALOO_CODE8_VALIDATED_BY_TOTAL_MINUS_SOT');
});

test('code 8 is rejected when it does not reconcile with total minus SOT',()=>{
  const source="tT_f[1]=[[4,'8','13',38,62],[5,'5','3',62,38],[8,'4','10',23,77],[11,'51%','49%',51,49]];";
  const row=parseStats(source).get('1');
  assert.equal(row.shots_off_target,null);
});

test('possession must look like a true two-team share',()=>{
  const source="tT_f[1]=[[5,'1','2',33,67],[11,'80%','40%',67,33]];";
  const row=parseStats(source).get('1');
  assert.equal(row.possession,null);
});

test('live index preserves Goaloo sourceMatchId, teams, minute and score',()=>{
  const source="var B=new Array();B[9]=[9,0,'J1 League'];var A=new Array();A[0]=[123,9,0,0,'Hokkaido Consadole Sapporo','Tochigi City','2026-09-06 06:00:00','2026-09-06 07:07:00',1,1,0,0,0,0,0,0,0];";
  const rows=parseLiveIndex(source);
  assert.equal(rows[0].sourceMatchId,'123');
  assert.equal(rows[0].home,'Hokkaido Consadole Sapporo');
  assert.equal(rows[0].away,'Tochigi City');
  assert.equal(rows[0].score.home,1);
  assert.equal(rows[0].score.away,0);
});

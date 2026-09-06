import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,schedule,evaluate} from '../src/rules.js';

test('หารช่วงเป็นสี่รอบเสมอ',()=>{
  assert.deepEqual(schedule(normalizeConfig({minuteFrom:55,minuteTo:85})),[55,65,75,85]);
  assert.deepEqual(schedule(normalizeConfig({minuteFrom:70,minuteTo:82})),[70,74,78,82]);
});

test('เปอร์เซ็นต์การบุกใช้ค่าเดียวเป็นเกณฑ์ขั้นต่ำ',()=>{
  const config=normalizeConfig({attackShare:60,dangerousShare:55,attackRate:57});
  assert.equal(config.attackShare,60);
  assert.equal(config.dangerousShare,55);
  assert.equal(config.attackRate,57);
  assert.equal('attackShareMax' in config,false);
});

test('ผ่านครบทุกเงื่อนไขฝั่งเจ้าบ้าน',()=>{
  const result=evaluate({
    side:'HOME',
    stats:{
      sot:{home:1,away:0},shotOff:{home:1,away:0},corners:{home:1,away:0},
      attacks:{home:60,away:40},dangerous:{home:55,away:45}
    },
    market:{source:'Nowgoal',line:-0.5,homeOdds:1.85,awayOdds:2}
  },{attackShare:60,dangerousShare:55,attackRate:57});
  assert.equal(result.passed,true);
  assert.equal(Number(result.metrics.attackShare.toFixed(1)),60);
});

test('ไม่ผ่านเมื่อเปอร์เซ็นต์ต่ำกว่าเกณฑ์เดียว',()=>{
  const result=evaluate({
    side:'HOME',
    stats:{
      sot:{home:1,away:0},shotOff:{home:1,away:0},corners:{home:1,away:0},
      attacks:{home:59,away:41},dangerous:{home:55,away:45}
    },
    market:{source:'Nowgoal',line:-0.5,homeOdds:1.85,awayOdds:2}
  },{attackShare:60,dangerousShare:50,attackRate:50});
  assert.equal(result.checks.attack,false);
  assert.equal(result.passed,false);
});

test('คำนวณเปอร์เซ็นต์ถูกแม้ฟีดส่งตัวเลขเป็นข้อความ',()=>{
  const result=evaluate({
    side:'HOME',
    stats:{
      sot:{home:'1',away:'0'},shotOff:{home:'1',away:'0'},corners:{home:'1',away:'0'},
      attacks:{home:'60',away:'40'},dangerous:{home:'55',away:'45'}
    },
    market:{source:'Nowgoal',line:'-0.5',homeOdds:'1.85',awayOdds:'2.00'}
  },{});
  assert.equal(result.passed,true);
  assert.equal(Number(result.metrics.attackShare.toFixed(1)),60);
  assert.equal(Number(result.metrics.dangerousShare.toFixed(1)),55);
  assert.equal(Number(result.metrics.attackRate.toFixed(1)),57);
});

test('กลับเครื่องหมาย AH เมื่อประเมินทีมเยือน',()=>{
  const result=evaluate({
    side:'AWAY',
    stats:{
      sot:{home:0,away:1},shotOff:{home:0,away:1},corners:{home:0,away:1},
      attacks:{home:40,away:60},dangerous:{home:45,away:55}
    },
    market:{source:'Nowgoal',line:-0.5,homeOdds:1.85,awayOdds:1.95}
  },{});
  assert.equal(result.passed,true);
  assert.equal(result.metrics.line,0.5);
});

test('ไม่ผ่านเมื่อราคามิใช่ Nowgoal',()=>{
  const result=evaluate({
    side:'HOME',
    stats:{
      sot:{home:1,away:0},shotOff:{home:1,away:0},corners:{home:1,away:0},
      attacks:{home:60,away:40},dangerous:{home:55,away:45}
    },
    market:{source:'Other',line:-0.5,homeOdds:1.85}
  },{});
  assert.equal(result.passed,false);
});

test('บังคับช่วงค่าตามสเปก',()=>{
  assert.throws(()=>normalizeConfig({attackShare:0}),/1 ถึง 100/);
  assert.throws(()=>normalizeConfig({dangerousShare:101}),/1 ถึง 100/);
  assert.throws(()=>normalizeConfig({attackRate:0}),/1 ถึง 100/);
  assert.throws(()=>normalizeConfig({ahMin:-5.25}),/-5 ถึง 10/);
  assert.throws(()=>normalizeConfig({ahMax:10.25}),/-5 ถึง 10/);
  assert.throws(()=>normalizeConfig({oddsMin:1}),/1.01 ถึง 10/);
  assert.throws(()=>normalizeConfig({oddsMax:10.01}),/1.01 ถึง 10/);
});

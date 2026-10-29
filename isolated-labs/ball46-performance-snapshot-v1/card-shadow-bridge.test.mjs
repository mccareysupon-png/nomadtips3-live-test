import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPreviewEndpoint,validateBrowserSnapshot,auditCardSnapshot,
  CARD_FIELDS,enableSnapshotCardRenderer} from './card-shadow-bridge.mjs';

const NOW=Date.parse('2026-10-29T12:00:00Z');
const URL='https://ball46-performance-snapshot-preview-only.example.workers.dev/api/performance/snapshot';
const COUNTS={win:2,loss:1,push:1,pending:0,totalPicks:4,winRate:'66.7%',avgOdds:'1.84'};
const payload=()=>({ok:true,schema:'ball46-performance-snapshot-v1',
  generatedAtUtc:new Date(NOW-1000).toISOString(),
  londonDay:{timezone:'Europe/London',cutHour:6,today:'2026-10-29',yesterday:'2026-10-28'},
  today:{...COUNTS,pending:1,totalPicks:5},yesterday:{...COUNTS}});
test('valid Preview contract checks London timezone and stale guard',()=>{
 assert.equal(validateBrowserSnapshot(payload(),NOW),true);
 assert.throws(()=>validateBrowserSnapshot(payload(),NOW+7*60000),/SNAPSHOT_EXPIRED/);
 assert.throws(()=>validateBrowserSnapshot({...payload(),londonDay:{...payload().londonDay,cutHour:8}},NOW),/DAY_MISMATCH/);
});
test('preview URL must never point at BALL46 Production or unrelated worker',()=>{
 assert.equal(assertPreviewEndpoint(URL),URL);
 for(const host of ['https://www.ball46.com','https://ball46-production.example.workers.dev',
 'http://ball46-performance-snapshot-preview-only.example.workers.dev',
 'https://ball46-performance-snapshot-preview-only.example.com']){
  assert.throws(()=>assertPreviewEndpoint(host+'/api/performance/snapshot'),/UNTRUSTED/);
 }
});
test('shadow reader reads existing card without writing to DOM',async()=>{
 const p=payload();let mutations=0;
 const card={querySelector(selector){
  const field=CARD_FIELDS.find(x=>x[2]===selector);
  return field?{get textContent(){return String(p[field[0]][field[1]])},set textContent(v){mutations++;}}:null;
 }};
 const doc={getElementById(id){return id==='ball46-daily-performance'?card:null}};
 const fetchFn=async()=>new Response(JSON.stringify(p),{status:200,
  headers:{'content-type':'application/json'}});
 const result=await auditCardSnapshot({endpoint:URL,fetchFn,documentRef:doc,nowMs:NOW});
 assert.equal(result.mode,'SHADOW_READ_ONLY');
 assert.equal(result.mismatchFields.length,0);
 assert.equal(result.visibleFieldsChecked,CARD_FIELDS.length);
 assert.equal(mutations,0);
});
test('shadow reader rejects stale and missing card rather than fabricate data',async()=>{
 const fetchFn=async()=>new Response(JSON.stringify(payload()),{status:200});
 await assert.rejects(()=>auditCardSnapshot({
  endpoint:URL,fetchFn,documentRef:{getElementById(){return null}},nowMs:NOW
 }),/CARD_NOT_FOUND/);
});
test('production renderer remains disabled until markets and assets pass',()=>{
 assert.throws(()=>enableSnapshotCardRenderer(),/GATES_NOT_YET_PASSED/);
});

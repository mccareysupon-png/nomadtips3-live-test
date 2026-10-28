import test from 'node:test';import assert from 'node:assert/strict';
import {JOBS,DEFAULTS,validateConfig,estimate,plan} from './control-core.mjs';
const base=()=>({limitPerMinute:40,jobs:Object.fromEntries(JOBS.map(id=>[id,{enabled:true,seconds:DEFAULTS[id]}]))});
test('valid baseline and explicit simulated total',()=>{const r=estimate(base());assert.ok(Math.abs(r.naiveRPM-10.2)<1e-9);assert.equal(r.estimatedHeadroom,29.8)});
test('reject invalid periods, missing jobs, oversized limits',()=>{const a=base();a.jobs.live.seconds=0;assert.throws(()=>validateConfig(a));const b=base();delete b.jobs.odds;assert.throws(()=>validateConfig(b));const c=base();c.limitPerMinute=41;assert.throws(()=>validateConfig(c))});
test('disabled jobs excluded',()=>{const c=base();c.jobs.signal.enabled=false;assert.equal(estimate(c).byJob.signal,0)});
test('never authorizes production writes',()=>{const p=plan(base(),{providerRequestsLast60s:7,observedAt:'2026-10-28T00:00:00Z'});assert.equal(p.canApply,false);assert.equal(p.measuredProviderRPM,7)});

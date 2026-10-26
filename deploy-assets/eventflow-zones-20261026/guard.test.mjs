import test from 'node:test';import assert from 'node:assert/strict';import {verifyBase} from './guard.mjs';
const good={activeWorkerVersion:'21c1519b-5874-412a-aea7-ebee2e057f46',sourceSelectors:{eventFlowRoot:'#event',plotRoot:'svg.plot',signalCards:'.signal',eventIcons:'.icon'},hasHideLast5:true,hasSidebarOutside:true,signalMinutes:[1,35,55,90],preview:true};
test('complete verified preview evidence passes',()=>assert.equal(verifyBase(good).ok,true));
test('prior worker base blocks integration',()=>assert.ok(verifyBase({...good,activeWorkerVersion:'65c82540-7c0f-4871-88de-9aaa1d1c73f2'}).failures.includes('ACTIVE_WORKER_VERSION_MISMATCH')));
test('unverified selectors block integration',()=>assert.ok(verifyBase({...good,sourceSelectors:{}}).failures.includes('UNVERIFIED_EVENTFLOW_DOM')));
test('sidebar and Last5 regressions block',()=>assert.equal(verifyBase({...good,hasHideLast5:false,hasSidebarOutside:false}).ok,false));
test('production switch blocked',()=>assert.ok(verifyBase({...good,preview:false}).failures.includes('PRODUCTION_ACTIVATION_NOT_ALLOWED_BY_THIS_CANDIDATE')));

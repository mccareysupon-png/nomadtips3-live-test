import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const path='/live-prediction-343.js?v=b46-monitor-20261030',r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(45000)}),body=Buffer.from(await r.arrayBuffer());
assert.equal(r.status,200,'DYNAMIC_PRODUCTION_STATIC_ASSET_UNAVAILABLE');assert(/javascript/.test(r.headers.get('content-type')),'NOT_JAVASCRIPT');
await writeFile('work/statistics-cursor-only-test-20261110/live-prediction.js',body);await writeFile('work/statistics-cursor-only-test-20261110/qa/dynamic-static.json',JSON.stringify({path,status:r.status,bytes:body.length,sha:createHash('sha256').update(body).digest('hex'),engineRequests:0,providerRequests:0},null,2));

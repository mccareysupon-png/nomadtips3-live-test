import assert from 'node:assert/strict';
import { activeVersion,api,script } from '../daily-performance-20261005/production.mjs';

const BROKEN='257c3015-e009-4c3f-abac-88e2e1981339';
const RESTORE='4996cd2c-988a-449f-8791-60a385e1b1b1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

const active=await activeVersion();
console.log('ACTIVE_BEFORE='+active);
assert.equal(active,BROKEN,'STOP_FOREIGN_PRODUCTION_ACTIVE');

await api('/scripts/'+script+'/deployments',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    strategy:'percentage',
    versions:[{version_id:RESTORE,percentage:100}],
    annotations:{'workers/message':'Emergency rollback broken Ball46 ticker WAAPI'}
  })
});

for(let i=0;i<30;i++){
  const v=await activeVersion();
  if(v===RESTORE)break;
  await delay(1000);
}
const final=await activeVersion();
assert.equal(final,RESTORE,'ROLLBACK_NOT_CONFIRMED');
console.log('ROLLBACK_CONFIRMED='+final);

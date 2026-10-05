import assert from 'node:assert/strict';
import { api, activeVersion, publicFile, script } from './production.mjs';

const BROKEN='bec66e37-795c-487b-b4ee-687d54fc6376';
const RESTORE='6871ec4e-baf0-4de5-9431-89480a0bd53a';

const before=await activeVersion();
assert.equal(before,BROKEN,`UNEXPECTED_ACTIVE_VERSION:${before}`);

await api(`/scripts/${script}/deployments`,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    strategy:'percentage',
    versions:[{version_id:RESTORE,percentage:100}],
    annotations:{'workers/message':'Emergency rollback: restore Signal card/alert behavior after Daily Performance visual deploy'}
  })
});

for(let i=0;i<30;i++){
  if(await activeVersion()===RESTORE)break;
  await new Promise(r=>setTimeout(r,1000));
}
assert.equal(await activeVersion(),RESTORE,'ROLLBACK_NOT_CONFIRMED');

const signals=JSON.parse((await publicFile('/api/engine/signals','json')).toString('utf8'));
assert(Array.isArray(signals?.signals),'SIGNALS_API_BAD_AFTER_ROLLBACK');
const board=JSON.parse((await publicFile('/api/engine/board','json')).toString('utf8'));
assert(board?.ok===true&&Array.isArray(board.fixtures),'BOARD_API_BAD_AFTER_ROLLBACK');
const index=(await publicFile('/index.html','html')).toString('utf8');
assert(index.length>1000,'INDEX_BAD_AFTER_ROLLBACK');

console.log(`SIGNAL_RESTORE_VERSION=${RESTORE}`);
console.log(`SIGNALS_COUNT=${signals.signals.length}`);
console.log(`FIXTURES_COUNT=${board.fixtures.length}`);
console.log('BALL46_SIGNAL_ROLLBACK_SUCCESS');

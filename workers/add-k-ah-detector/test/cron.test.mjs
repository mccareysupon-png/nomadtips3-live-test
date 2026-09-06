import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('Cron ส่งงานเข้า cycle ภายในด้วย header ที่ผู้ใช้ปลอมจากภายนอกไม่ได้',async()=>{
  let requestSeen=null;
  let promiseSeen=null;
  const stub={
    idFromName(name){assert.equal(name,'main');return 'detector-main'},
    get(id){
      assert.equal(id,'detector-main');
      return{
        async fetch(input,init){
          requestSeen=new Request(input,init);
          return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});
        }
      };
    }
  };
  const ctx={waitUntil(promise){promiseSeen=promise}};

  worker.scheduled({}, {DETECTOR:stub}, ctx);
  assert.ok(promiseSeen);
  await promiseSeen;
  assert.ok(requestSeen);
  assert.equal(new URL(requestSeen.url).pathname,'/cycle');
  assert.equal(requestSeen.method,'POST');
  assert.equal(requestSeen.headers.get('x-add-k-internal'),'cron');
});

// Production route smoke is performed by the deploy workflow after this test passes.

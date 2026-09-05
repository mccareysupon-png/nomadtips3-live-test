import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('ledger CORS preflight returns an empty 204 response for the production site',async()=>{
  const request=new Request('https://nomadtips3-342-ledger.mccarey-supon.workers.dev/lock',{
    method:'OPTIONS',
    headers:{
      origin:'https://www.nomadtips3.com',
      'access-control-request-method':'POST',
      'access-control-request-headers':'content-type',
    },
  });
  const response=await worker.fetch(request,{});
  assert.equal(response.status,204);
  assert.equal(await response.text(),'');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://www.nomadtips3.com');
  assert.match(response.headers.get('access-control-allow-methods')||'',/POST/);
  assert.match(response.headers.get('access-control-allow-headers')||'',/content-type/i);
});

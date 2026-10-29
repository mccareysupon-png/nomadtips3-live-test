import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRemoteConfig,assertIsolatedPreviewConfig,PREVIEW_WORKER,PREVIEW_DB} from './remote-preview-config.mjs';
const ID='11111111-1111-4111-8111-111111111111';
test('preview worker is separate and only on workers.dev',()=>{
 const c=makeRemoteConfig(ID);
 assert.equal(c.name,PREVIEW_WORKER);
 assert.notEqual(c.name,'ball46-production');
 assert.equal(c.workers_dev,true);
 assert.equal(c.preview_urls,false);
 assert.equal(c.d1_databases[0].database_name,PREVIEW_DB);
 for(const key of ['routes','route','assets','services','kv_namespaces'])
   assert.equal(Object.hasOwn(c,key),false);
 assert.equal(assertIsolatedPreviewConfig(c),true);
});
test('reject missing or malformed preview database id',()=>{
 for(const id of [null,'not-uuid','', '00000000-0000-0000'])assert.throws(()=>makeRemoteConfig(id));
});
test('fail closed if someone introduces production name or route',()=>{
 const c=makeRemoteConfig(ID);
 assert.throws(()=>assertIsolatedPreviewConfig({...c,name:'ball46-production'}));
 assert.throws(()=>assertIsolatedPreviewConfig({...c,routes:['ball46.com/*']}));
 assert.throws(()=>assertIsolatedPreviewConfig({...c,services:[{binding:'ENGINE',service:'nomadtips3-engine-343'}]}));
 assert.throws(()=>assertIsolatedPreviewConfig({...c,d1_databases:[{...c.d1_databases[0],database_name:'BALL46_MEMBER_DAILY_SNAPSHOT_PRODUCTION'}]}));
});

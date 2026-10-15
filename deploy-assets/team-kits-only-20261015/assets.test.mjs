import test from 'node:test';
import assert from 'node:assert/strict';
import {assetManifest,completeAssetUpload,createPayload} from './assets.mjs';
const files=new Map([['index.html',{bytes:Buffer.from('<html>current</html>'),type:'text/html'}],['team-kits-343.js',{bytes:Buffer.from('current shirts'),type:'application/javascript'}],['current-extra.css',{bytes:Buffer.from('preserve this'),type:'text/css'}]]);
const paths=[...files.keys()];
test('manifest retains every current path including unrelated assets',()=>assert.deepEqual(Object.keys(assetManifest(files,paths).manifest).sort(),paths.map(x=>'/'+x).sort()));
test('omitting an unrelated asset fails before registration',()=>assert.throws(()=>assetManifest(new Map([...files].slice(0,2)),paths),/ASSET_PATH_SET_MISMATCH/));
test('multipart includes bytes and MIME types and returns a completion token',async()=>{
 const {byHash}=assetManifest(files,paths);const sent=[],hashes=[...byHash.keys()];
 const upload=await completeAssetUpload({account:'account',script:'ball46-production',files,expectedPaths:paths,api:async(path,body)=>{assert.equal(path,'/workers/scripts/ball46-production/assets-upload-session');assert.equal(Object.keys(body.manifest).length,3);return {jwt:'test-upload-only',buckets:[[hashes[0]],hashes.slice(1)]};},fetchUpload:async(url,options)=>{assert(url.endsWith('/workers/assets/upload?base64=true'));for(const [hash,part]of options.body){const entry=byHash.get(hash);assert.equal(await part.text(),entry.base64);assert.equal(part.type,entry.type);sent.push(hash);}return new Response(JSON.stringify({success:true,result:sent.length===3?{jwt:'test-completion-only'}:{}}));}});
 assert.equal(upload.fileCount,3);assert.equal(upload.uploadedHashCount,3);assert.equal(upload.jwt,'test-completion-only');
});
test('deduplicated existing assets use the registration completion token',async()=>{const r=await completeAssetUpload({account:'a',script:'ball46-production',files,expectedPaths:paths,api:async()=>({jwt:'existing-completion',buckets:[]}),fetchUpload:async()=>{throw Error('must not upload')}});assert.equal(r.uploadedHashCount,0);assert.equal(r.jwt,'existing-completion');});
test('missing completion token blocks version creation',async()=>{await assert.rejects(completeAssetUpload({account:'a',script:'ball46-production',files,expectedPaths:paths,api:async()=>({jwt:'upload-only',buckets:[[...assetManifest(files,paths).byHash.keys()]]}),fetchUpload:async()=>new Response(JSON.stringify({success:true,result:{}}))}),/ASSET_COMPLETION_TOKEN_MISSING/);});
test('version payload cannot reproduce the previous missing-assets error',()=>{
 const base={main_module:'index.js',modules:[{name:'index.js',content_type:'application/javascript+module',content_base64:Buffer.from('unchanged worker').toString('base64')},{name:'assets/index.html',content_type:'text/plain',content_base64:Buffer.from('current html').toString('base64')}],bindings:[{name:'ASSETS',type:'assets'},{name:'ENGINE',type:'service',service:'unchanged-engine'}],assets:{config:{run_worker_first:true}},compatibility_date:'2026-09-09'};
 assert.throws(()=>createPayload(base,'shirt loader','', 'test'),/ASSET_COMPLETION_TOKEN_REQUIRED/);
 const payload=createPayload(base,'shirt loader','completion-only','test');assert.equal(payload.assets.jwt,'completion-only');assert.deepEqual(payload.modules[0],base.modules[0]);assert.deepEqual(payload.bindings,base.bindings);assert(!payload.bindings.some(x=>x.type==='inherit'));
});

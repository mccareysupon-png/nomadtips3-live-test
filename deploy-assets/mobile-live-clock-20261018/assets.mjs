import assert from 'node:assert/strict';
import {extname} from 'node:path';
import {createHash} from 'node:crypto';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function assetManifest(files,expectedPaths){
 assert.deepEqual([...files.keys()].sort(),[...expectedPaths].sort(),'ASSET_PATH_SET_MISMATCH');
 const manifest={},byHash=new Map();
 for(const [path,file]of files){
  assert(path&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(x=>x==='..'||!x),'UNSAFE_ASSET_PATH');
  assert(file.bytes.length>0&&file.type,'EMPTY_OR_UNTYPED_ASSET:'+path);
  const base64=file.bytes.toString('base64'),hash=digest(base64+extname(path).slice(1)).slice(0,32);
  manifest['/'+path]={hash,size:file.bytes.length};
  const prior=byHash.get(hash);if(prior)assert.equal(prior.base64,base64,'ASSET_HASH_COLLISION');
  byHash.set(hash,{base64,type:file.type,path});
 }
 return {manifest,byHash};
}
export async function completeAssetUpload({account,script,files,expectedPaths,api,fetchUpload=fetch}){
 const {manifest,byHash}=assetManifest(files,expectedPaths);
 const start=await api(`/workers/scripts/${script}/assets-upload-session`,{manifest});
 assert(start.jwt&&Array.isArray(start.buckets),'ASSET_SESSION_INVALID');
 const bucketHashes=start.buckets.flat();assert.equal(new Set(bucketHashes).size,bucketHashes.length,'DUPLICATE_BUCKET_HASH');
 for(const hash of bucketHashes)assert(byHash.has(hash),'UNKNOWN_REQUESTED_ASSET_HASH');
 let completion=start.buckets.length?undefined:start.jwt;
 for(const bucket of start.buckets){
  const form=new FormData();for(const hash of bucket){const entry=byHash.get(hash);form.append(hash,new Blob([entry.base64],{type:entry.type}),hash);}
  const response=await fetchUpload(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/assets/upload?base64=true`,{method:'POST',headers:{Authorization:`Bearer ${start.jwt}`},body:form,signal:AbortSignal.timeout(60000)});
  const json=await response.json();assert(response.ok&&json.success===true,`ASSET_UPLOAD_FAILED:${response.status}:${JSON.stringify(json.errors||[]).slice(0,300)}`);
  if(json.result?.jwt)completion=json.result.jwt;
 }
 assert(completion,'ASSET_COMPLETION_TOKEN_MISSING');
 return {jwt:completion,fileCount:files.size,uploadedHashCount:bucketHashes.length};
}
export function candidateModules(base,html){
 assert(base.modules.some(x=>x.name==='assets/index.html'),'INDEX_TEXT_MODULE_MISSING');
 return base.modules.map(x=>x.name==='assets/index.html'?{...x,content_base64:Buffer.from(html).toString('base64')}:x);
}
export function createPayload(base,html,completionJwt,tag){
 assert(typeof completionJwt==='string'&&completionJwt.length>0,'ASSET_COMPLETION_TOKEN_REQUIRED');
 assert(base.bindings.every(x=>['assets','service'].includes(x.type)),'UNSUPPORTED_BINDING');
 const body={main_module:base.main_module,modules:candidateModules(base,html),bindings:base.bindings,assets:{jwt:completionJwt,config:base.assets.config},compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],usage_model:base.usage_model,annotations:{'workers/tag':tag,'workers/message':'Show existing mobile live clock with scoped CSS only; scripts, backend and all other assets preserved'}};
 for(const key of ['limits','placement'])if(base[key])body[key]=base[key];
 return body;
}

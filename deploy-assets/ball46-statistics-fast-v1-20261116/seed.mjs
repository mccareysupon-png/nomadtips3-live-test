// BALL46 V1 initial production-only read cache seeding, CI-only. Same proven
// immutable snapshot build as the scheduled Worker. No live Worker writes.
import {sync,STATS_META} from './snapshot-worker.mjs';
const account='62cb0db544160e6591342abd6b4f35cc';
const id=process.env.B46_FAST_V1_NAMESPACE_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!id||!token)throw Error('FAST_PROD_NAMESPACE_OR_TOKEN_MISSING');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+
 '/storage/kv/namespaces/'+id+'/values/';
async function get(key,mode){
 const r=await fetch(base+encodeURIComponent(key),{
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
 if(r.status===404)return null;
 if(!r.ok)throw Error('DEDICATED_KV_GET_'+r.status+'_'+key);
 const s=await r.text();
 return mode==='json'?JSON.parse(s):s;
}
async function put(key,value,options={}){
 const url=new URL(base+encodeURIComponent(key));
 if(options.expirationTtl)url.searchParams.set('expiration_ttl',String(options.expirationTtl));
 const r=await fetch(url,{method:'PUT',headers:{
  Authorization:'Bearer '+token,
  'Content-Type':'application/json;charset=utf-8'
 },body:value,signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 if(!r.ok||j.success!==true)throw Error('DEDICATED_KV_PUT_'+r.status+'_'+key);
}
const env={
 B46_FAST_KV:{get,put},
 B46_PRODUCTION_READ:{fetch:req=>fetch(req,{signal:AbortSignal.timeout(25000)})}
};
const result=await sync(env);
const meta=await get(STATS_META,'json');
if(meta?.schema!==1||meta.ledgerTotal<1000||Date.now()-meta.checkedAt>60000)
 throw Error('KV_META_NOT_READY');
console.log('B46_FAST_V1_SEED='+JSON.stringify({
 ...result,isolatedProductionKV:true,source:'PRODUCTION_PUBLIC_READ_ONLY',
 schema:meta.schema,checkedAt:meta.checkedAt,noEngineOrLedgerWrites:true}));

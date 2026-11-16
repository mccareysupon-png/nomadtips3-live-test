// ONE-TIME migration only: last fully verified real Ledger -> latest balance.
// Subsequent V2 settlements must use applyLedgerTransition(), never this scan.
// Writes to isolated STAGING KV namespace only. No Engine or Production writes.
import {createHash} from 'node:crypto';
import {buildSnapshot,readPage,signature} from './stage-kv-sync.mjs';
import {seedFromLatestVerified,displaySnapshot} from './incremental-accounting-v2-stage.mjs';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc';
const STAGE_KV='f144dc8b6525477984067f7ab5762924';
const META='b46-v2-running-account-checkpoint-staging';
const API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/storage/kv/namespaces/'+STAGE_KV+'/values/';
const sha=body=>createHash('sha256').update(body).digest('hex');
const token=process.env.CLOUDFLARE_API_TOKEN;
const guard=()=>{if(!token)throw Error('STAGE_KV_TOKEN_MISSING')};
async function get(key){
 guard();
 const r=await fetch(API+encodeURIComponent(key),{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
 if(r.status===404)return null;
 if(!r.ok)throw Error('STAGE_KV_GET_'+r.status);
 return r.text();
}
async function put(key,body){
 guard();
 const r=await fetch(API+encodeURIComponent(key),{method:'PUT',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body,signal:AbortSignal.timeout(45000)});
 const j=await r.json().catch(()=>null);
 if(!r.ok||j?.success!==true)throw Error('STAGE_KV_WRITE_'+r.status);
}
export async function seedOnce(){
 guard();
 const prior=await get(META);
 if(prior){
  const manifest=JSON.parse(prior);
  if(manifest.schema!==2||!/^b46-v2-s-[0-9a-f]{32}$/.test(manifest.stateKey||''))
   throw Error('EXISTING_V2_CHECKPOINT_UNKNOWN_FORMAT');
  console.log('B46_V2_BOOTSTRAP='+JSON.stringify({mode:'ALREADY_SEEDED_NO_RECOUNT',
    stageOnly:true,settled:manifest.settled,ledgerTotal:manifest.ledgerTotal,
    seededAt:manifest.seededAt,productionWrites:0}));
  return manifest;
 }
 // Explicit once-only migration. This is NOT a request handler or scheduler.
 const verified=await buildSnapshot(readPage);
 const state=seedFromLatestVerified(verified),display=displaySnapshot(state);
 if(state.bootstrapLedgerCount!==verified.ledgerTotal||state.historicalRowsRetained!==0||
    display.total!==verified.total||display.summary.rows!==verified.total||
    Object.hasOwn(display,'rows')||Object.hasOwn(state,'rows'))
  throw Error('LATEST_BALANCE_BOOTSTRAP_INCONSISTENT');
 const originalSignature=signature(verified);
 const latest=await readPage();
 if(signature(latest)!==originalSignature)
  throw Error('SOURCE_CHANGED_AFTER_V2_MIGRATION');
 const stateBody=JSON.stringify(state),displayBody=JSON.stringify(display);
 if(Buffer.byteLength(stateBody)>262144||Buffer.byteLength(displayBody)>65536)
  throw Error('V2_BALANCE_TOO_LARGE');
 const stateHash=sha(stateBody),displayHash=sha(displayBody);
 const stateKey='b46-v2-s-'+stateHash.slice(0,32);
 const displayKey='b46-v2-d-'+displayHash.slice(0,32);
 await put(stateKey,stateBody);
 await put(displayKey,displayBody);
 const [s,d]=await Promise.all([get(stateKey),get(displayKey)]);
 if(sha(s||'')!==stateHash||sha(d||'')!==displayHash)
  throw Error('V2_IMMUTABLE_READBACK_FAILED');
 // Fail closed: no changes to Engine and no delta hook yet.
 const meta={schema:2,mode:'INITIAL_SEED_VERIFY_ONLY',
  readyForLive:false,stateKey,displayKey,stateHash,displayHash,
  sourceSignature:originalSignature,seededAt:state.updatedAt,
  ledgerTotal:display.ledgerTotal,settled:display.total,pending:display.pending,
  historicalMatchRowsInCheckpoint:0,stageOnly:true,productionWrites:0};
 await put(META,JSON.stringify(meta));
 console.log('B46_V2_BOOTSTRAP='+JSON.stringify({mode:'ONE_TIME_SEEDED',
  stageOnly:true,ledgerTotal:meta.ledgerTotal,settled:meta.settled,
  stateBytes:Buffer.byteLength(stateBody),displayBytes:Buffer.byteLength(displayBody),
  historicalMatchRowsInCheckpoint:0,readyForLive:false,productionWrites:0}));
 return meta;
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)
 seedOnce().catch(e=>{console.error('B46_V2_BOOTSTRAP_FAILED='+String(e));process.exitCode=1});

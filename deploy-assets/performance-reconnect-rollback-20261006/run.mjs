import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const candidate='4f9b7e60-5dd8-4818-80f3-c8739b84de47';
const restore='58569c5a-57f9-47f7-aad5-df81789897da';
const afterIndexSha='a1fa5dfe64bc20efc3206d4a9d1d7e5269eef9952aafd205a61ca0159958166d';
const beforeIndexSha='42bd94b8e3e8a6ceebc51970dc3453ce5f924a434d576fdabf263bade8e4baf6';

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers`+path,{
    ...options,
    headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},
    signal:AbortSignal.timeout(60000)
  });
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}
async function activeVersion(){
  const d=await api(`/scripts/${script}/deployments`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_VERSION_AMBIGUOUS');
  return v[0].version_id;
}
async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function fetchIndex(){
  const r=await fetch('https://ball46.com/index.html?_rollback='+Date.now(),{
    cache:'no-store',
    headers:{'Cache-Control':'no-cache'},
    signal:AbortSignal.timeout(60000)
  });
  assert(r.ok,'PUBLIC_INDEX_HTTP_'+r.status);
  return r.text();
}

const active=await activeVersion();
const currentIndex=await fetchIndex();
const currentSha=await sha256(currentIndex);
console.log('PERFORMANCE_RECONNECT_ROLLBACK_PREFLIGHT',JSON.stringify({active,currentSha,candidate,restore}));

const allowedActive=new Set([candidate,'2998bed7-7d95-4e31-b87e-1dda192f5841']);
assert(allowedActive.has(active),'STOP_UNKNOWN_ACTIVE_VERSION');
assert.equal(currentSha,afterIndexSha,'STOP_PUBLIC_INDEX_MOVED');

await api(`/scripts/${script}/deployments`,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    strategy:'percentage',
    versions:[{version_id:restore,percentage:100}],
    annotations:{'workers/message':'Rollback Ball46 Performance Reconnect; restore exact pre-reconnect Production version'}
  })
});

for(let i=0;i<20;i++){
  if(await activeVersion()===restore)break;
  await new Promise(r=>setTimeout(r,1500));
}
assert.equal(await activeVersion(),restore,'RESTORE_VERSION_NOT_ACTIVE');

let verified=false;
for(let i=0;i<20;i++){
  const html=await fetchIndex();
  const digest=await sha256(html);
  if(digest===beforeIndexSha){
    verified=true;
    console.log('PERFORMANCE_RECONNECT_ROLLBACK_VERIFY',JSON.stringify({digest,expected:beforeIndexSha}));
    break;
  }
  await new Promise(r=>setTimeout(r,1500));
}
assert(verified,'PUBLIC_INDEX_VERIFY_FAILED');

console.log('BALL46_PERFORMANCE_RECONNECT_ROLLBACK_SUCCESS',JSON.stringify({
  from:candidate,to:restore,indexSha:beforeIndexSha
}));

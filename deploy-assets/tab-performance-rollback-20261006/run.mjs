import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const candidate='54ba9840-a64a-4ae8-b10f-61088fcb7800';
const restore='4f9b7e60-5dd8-4818-80f3-c8739b84de47';
const beforeIndexSha='a1fa5dfe64bc20efc3206d4a9d1d7e5269eef9952aafd205a61ca0159958166d';

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
  const r=await fetch('https://ball46.com/index.html?_rollback='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
  assert(r.ok,'PUBLIC_INDEX_HTTP_'+r.status);
  return r.text();
}

const active=await activeVersion();
console.log('TAB_ROLLBACK_PREFLIGHT',JSON.stringify({active,candidate,restore}));

if(active!==candidate){
  console.log('TAB_ROLLBACK_STOP_FOREIGN_ACTIVE',JSON.stringify({active,candidate,restore}));
  process.exit(2);
}

const currentIndex=await fetchIndex();
assert(currentIndex.includes('document.title'),'TAB_PATCH_NOT_PRESENT_STOP');

await api(`/scripts/${script}/deployments`,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    strategy:'percentage',
    versions:[{version_id:restore,percentage:100}],
    annotations:{'workers/message':'Rollback Ball46 tab performance only; restore pre-tab Production version'}
  })
});

for(let i=0;i<20;i++){
  if(await activeVersion()===restore)break;
  await new Promise(r=>setTimeout(r,1500));
}
assert.equal(await activeVersion(),restore,'TAB_ROLLBACK_NOT_ACTIVE');

let ok=false;
for(let i=0;i<20;i++){
  try{
    const html=await fetchIndex();
    const digest=await sha256(html);
    if(digest===beforeIndexSha){
      ok=true;
      console.log('TAB_ROLLBACK_VERIFY',JSON.stringify({digest,expected:beforeIndexSha}));
      break;
    }
  }catch{}
  await new Promise(r=>setTimeout(r,1500));
}
assert(ok,'TAB_ROLLBACK_PUBLIC_VERIFY_FAILED');

console.log('BALL46_TAB_PERFORMANCE_ROLLBACK_SUCCESS',JSON.stringify({from:candidate,to:restore,indexSha:beforeIndexSha}));

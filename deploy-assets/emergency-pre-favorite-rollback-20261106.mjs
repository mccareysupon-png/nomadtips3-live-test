import assert from 'node:assert/strict';

const SCRIPT='ball46-production';
const TARGET='0b69a9d6-93b2-4362-ac73-d663d5e7949c';
const ORIGIN='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json(); assert(r.ok&&j.success===true,`CF_ERROR ${r.status} ${JSON.stringify(j.errors||j)}`); return j.result;
}
async function active(){
  const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function activate(id,msg){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
async function getVersion(id){
  const v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
  assert(v?.id===id||v?.main_module,'TARGET_VERSION_NOT_READABLE');
  return v;
}

const before=await active();
console.log('BEFORE='+before);
const target=await getVersion(TARGET);
assert(target.main_module,'TARGET_MAIN_MODULE_MISSING');

await activate(TARGET,'Emergency rollback to pre-Favorite clean point 2026-11-06');
for(let i=0;i<30;i++){if(await active()===TARGET)break;await delay(1000)}
assert.equal(await active(),TARGET,'ROLLBACK_TARGET_NOT_ACTIVE');

let ok=false,last='';
for(let i=0;i<10;i++){
  try{
    const u=new URL(ORIGIN);u.searchParams.set('emergencyRollbackQa',Date.now());
    const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    last=`${r.status} ${r.headers.get('content-type')}`;
    if(r.ok&&String(r.headers.get('content-type')||'').includes('text/html')){
      const h=await r.text();
      if(h.length>10000){ok=true;break}
    }
  }catch(e){last=String(e)}
  await delay(1000);
}
assert(ok,'PUBLIC_HOME_NOT_HEALTHY:'+last);
console.log('FINAL_PRODUCTION='+TARGET);
console.log('EMERGENCY_PRE_FAVORITE_ROLLBACK_SUCCESS');

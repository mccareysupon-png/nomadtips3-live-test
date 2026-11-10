import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){
  const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);
  return j.result;
}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
const vv=d.deployments?.[0]?.versions;
assert(vv?.length===1&&Number(vv[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
const active=vv[0].version_id;
const ver=await api(`/workers/${SCRIPT}/versions/${active}?include=modules`);
console.log('ACTIVE_VERSION='+active);
console.log('MAIN_MODULE='+ver.main_module);
console.log('MODULE_COUNT='+(ver.modules||[]).length);

const needles=[
  'member.ball46.com','member2.ball46.com','/member','login','sign in','signin','email',
  'session','auth','magic','otp','password','token','cookie','accept','membership',
  'member center','statistics','signal'
];

for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  let matched=false;
  for(const n of needles){
    if(txt.toLowerCase().includes(n.toLowerCase())){matched=true;break;}
  }
  if(!matched) continue;
  console.log('===MODULE '+m.name+'===');
  for(const n of needles){
    let p=0,c=0;
    while(true){
      const i=txt.toLowerCase().indexOf(n.toLowerCase(),p);
      if(i<0) break;
      c++;
      const ctx=txt.slice(Math.max(0,i-1200),Math.min(txt.length,i+n.length+3000));
      console.log('NEEDLE='+n);
      console.log('CTX='+ctx.replace(/\n/g,'\\n'));
      p=i+n.length;
      if(c>=15) break;
    }
  }
}

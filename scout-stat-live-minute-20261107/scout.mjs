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

const needles=[
  "SOURCE 1",
  "sp-result",
  "PENDING",
  "WIN",
  "live-minute",
  "minute",
  "animation",
  "@keyframes",
  "blink",
  "pulse",
  "result"
];
for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  if(!/statistics|sp-result|minute|source 1|win|pending/i.test(txt)) continue;
  for(const n of needles){
    let pos=0,count=0;
    while(true){
      const i=txt.toLowerCase().indexOf(n.toLowerCase(),pos); if(i<0)break;
      count++;
      const ctx=txt.slice(Math.max(0,i-1500),Math.min(txt.length,i+n.length+3200));
      if(/statistics|sp-result|minute|blink|pulse|source 1|win|pending/i.test(ctx)){
        console.log('MODULE='+m.name);
        console.log('NEEDLE='+n);
        console.log('CONTEXT='+ctx.replace(/\n/g,'\\n'));
      }
      pos=i+n.length;
      if(count>=30)break;
    }
  }
}

import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);
  return j.result;
}
const deps=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
const versions=deps.deployments?.[0]?.versions;
assert(versions?.length===1&&Number(versions[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
const active=versions[0].version_id;
const v=await api(`/workers/${SCRIPT}/versions/${active}?include=modules`);
const needles=['Live Betting Tips','BALL46 | Live Betting Tips','document.title','<title>'];
console.log('ACTIVE_VERSION='+active);
for(const m of v.modules||[]){
  const buf=Buffer.from(m.content_base64||'','base64');
  const txt=buf.toString('utf8');
  for(const n of needles){
    const i=txt.indexOf(n);
    if(i>=0){
      const start=Math.max(0,i-220), end=Math.min(txt.length,i+n.length+420);
      console.log('MATCH_MODULE='+m.name);
      console.log('NEEDLE='+n);
      console.log('CONTEXT='+txt.slice(start,end).replace(/\n/g,'\\n'));
    }
  }
}
console.log('SCOUT_DONE');

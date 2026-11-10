import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){
  const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR:${r.status}`);
  return j.result;
}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
const vv=d.deployments?.[0]?.versions;assert(vv?.length===1,'ACTIVE_BAD');
const active=vv[0].version_id;
const ver=await api(`/workers/${SCRIPT}/versions/${active}?include=modules`);
console.log('ACTIVE_VERSION='+active);
const needles=[
 'full-market-bookmaker-343.js','expand-full-market-card','b46gn-full-market','fmb-market',
 'content-visibility','contain: layout paint','MutationObserver','renderWorkspaceScorebar',
 'b46-signal-ticker','requestAnimationFrame','setInterval','marketTable(','affiliatePriceHtml',
 'providerBooks(','BOOKS=[','fmb-tabs','replaceChildren','innerHTML','scrollWidth','getBoundingClientRect'
];
for(const m of ver.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 const low=t.toLowerCase();
 const hit=needles.filter(n=>low.includes(n.toLowerCase()));
 if(!hit.length) continue;
 console.log('MODULE='+m.name);
 console.log('HIT='+hit.join(','));
 for(const n of hit){
   let p=0,c=0;
   while(true){
     const i=low.indexOf(n.toLowerCase(),p);if(i<0)break;
     const ctx=t.slice(Math.max(0,i-1800),Math.min(t.length,i+n.length+4200)).replace(/\n/g,'\\n');
     console.log('NEEDLE='+n);
     console.log('CTX='+ctx);
     p=i+n.length;if(++c>=12)break;
   }
 }
}

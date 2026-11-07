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
  'AFFILIATE_URLS[',
  'AFFILIATE_URLS.',
  'AFFILIATE_URLS',
  'href=',
  'target="_blank"',
  'rel="noopener',
  'price-link',
  'odds-link',
  'book-link',
  'data-book',
  'data-odds'
];
for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  if(!/full-market|bookmaker|odds|AFFILIATE_URLS/i.test(txt)) continue;
  for(const n of needles){
    let pos=0,count=0;
    while(true){
      const i=txt.indexOf(n,pos); if(i<0)break;
      count++;
      const ctx=txt.slice(Math.max(0,i-1800),Math.min(txt.length,i+n.length+3600));
      if(/AFFILIATE_URLS|bookmaker|odds|price|fmb-|market-cell|full-market/i.test(ctx)){
        console.log('MODULE='+m.name);
        console.log('NEEDLE='+n);
        console.log('CONTEXT='+ctx.replace(/\n/g,'\\n'));
      }
      pos=i+n.length;
      if(count>=50)break;
    }
  }
}

console.log('--- ODDS_LINK_FINAL_AUDIT ---');
for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  const mapNeedles=['const AFFILIATE_URLS=Object.freeze({','AFFILIATE_URLS=Object.freeze({'];
  for(const mn of mapNeedles){const i=txt.indexOf(mn);if(i>=0){console.log('MAP_MODULE='+m.name);console.log('MAP_CONTEXT='+txt.slice(i,Math.min(txt.length,i+12000)).replace(/\n/g,'\\n'));}}
  let p=0;
  while(true){const i=txt.indexOf('AFFILIATE_URLS',p);if(i<0)break;const ctx=txt.slice(Math.max(0,i-2600),Math.min(txt.length,i+8000));if(/href|anchor|<a|createElement\(['\"]a['\"]\)|price|odds/i.test(ctx)){console.log('USAGE_MODULE='+m.name);console.log('USAGE_CONTEXT='+ctx.replace(/\n/g,'\\n'));}p=i+14;}
}

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
const needles=['reffpa.com','affiliate','href=','target="_blank"','target=\'_blank\'','10Bet','12BET','Bet365','1xbet','bookmaker'];
for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  for(const n of needles){
    let pos=0,count=0;
    while(true){
      const i=txt.indexOf(n,pos); if(i<0) break;
      count++;
      if(count<=10){
        console.log('MODULE='+m.name);
        console.log('NEEDLE='+n);
        console.log('CONTEXT='+txt.slice(Math.max(0,i-900),Math.min(txt.length,i+n.length+1800)).replace(/\n/g,'\\n'));
      }
      pos=i+n.length;
    }
    if(count) console.log('COUNT:'+m.name+':'+n+'='+count);
  }
}


console.log('--- EXTERNAL_LINK_AUDIT ---');
for(const m of ver.modules||[]){
  const txt=Buffer.from(m.content_base64||'','base64').toString('utf8');
  const re=/https?:\\/\\/[^"'\\s<>\\)]+/g;
  const seen=new Set();
  for(const match of txt.matchAll(re)){
    const url=match[0];
    if(seen.has(url))continue; seen.add(url);
    if(/ball46\\.com|workers\\.dev|github|google|schema\\.org|w3\\.org|fonts|cloudflare/i.test(url))continue;
    const i=match.index||0;
    const ctx=txt.slice(Math.max(0,i-700),Math.min(txt.length,i+url.length+1200));
    if(/book|odds|market|price|affiliate|bet365|1xbet|10bet|12bet|reffpa/i.test(ctx)){
      console.log('EXT_MODULE='+m.name);
      console.log('EXT_URL='+url);
      console.log('EXT_CONTEXT='+ctx.replace(/\\n/g,'\\\\n'));
    }
  }
}

import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const prefix='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const get=async(path)=>{const r=await fetch(prefix+path,{headers:{authorization:'Bearer '+token}});const j=await r.json();assert(r.ok&&j.success);return j.result};
const id=(await get('/scripts/ball46-prematch-only-test-20261120/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await get('/workers/ball46-prematch-only-test-20261120/versions/'+id+'?include=modules');
const mods=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
for(const [name,body] of Object.entries(mods)){
 const checks=['scheduled(','scheduled:','async scheduled','/monitor','/bot-run','/btts-cycle-test','cron'];
 const hits=checks.map(c=>({term:c,index:body.indexOf(c)})).filter(x=>x.index>=0);
 if(hits.length)console.log('B46_STREAK_SCHEDULE_DISCOVERY '+JSON.stringify({
  name,isMain:name===v.main_module,length:body.length,hits,
  samples:hits.map(x=>({term:x.term,part:body.slice(Math.max(0,x.index-160),x.index+300).replace(/Bearer [^\s,"]+/g,'Bearer REDACTED')}))
 }).slice(0,10500));
}

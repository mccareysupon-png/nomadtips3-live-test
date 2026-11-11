import assert from 'node:assert/strict';
const SCRIPT='ball46-production', EXPECT='fbdde527-b04f-4675-8e4e-485f8406a1e2';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const active=d.deployments?.[0]?.versions?.[0]?.version_id;
assert.equal(active,EXPECT,'ACTIVE_VERSION_DRIFT');
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
for(const name of ['index.js','screen-refresh-5s-20261104.txt','assets/index.html']){
 const m=v.modules.find(x=>x.name===name);assert(m,'MISSING_'+name);
 const t=Buffer.from(m.content_base64,'base64').toString('utf8');
 const hits={
   oldVer:(t.match(/b46-screen-refresh-5s-20261104/g)||[]).length,
   pin:(t.match(/B46_PIN_V2_FRESH_20261111/g)||[]).length,
   signalFix:(t.match(/B46_PIN_V2_SIGNAL_BADGE_FIX_20261112/g)||[]).length,
   mobile:(t.match(/B46_PIN_V2_MOBILE_20261111/g)||[]).length,
   mobileOldZ:(t.match(/z-index:auto;left:8px/g)||[]).length
 };
 console.log('MODULE='+name+' '+JSON.stringify(hits));
 if(name==='index.js'){
   for(const needle of ['b46-screen-refresh-5s-20261104',"searchParams.get('v')"]){
     let p=t.indexOf(needle); if(p>=0)console.log('CTX='+name+' '+needle+' '+JSON.stringify(t.slice(Math.max(0,p-500),p+1200)));
   }
 }
 if(name==='assets/index.html'){
   const p=t.indexOf('dashboard-v2-stage3-featured-facts-20261013a.js');
   console.log('CTX='+name+' dashboard '+JSON.stringify(t.slice(Math.max(0,p-300),p+800)));
 }
}
console.log('HOTFIX_PREFLIGHT_PASS=1');

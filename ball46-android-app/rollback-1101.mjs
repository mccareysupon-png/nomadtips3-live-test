import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const BAD='627f9819-da0a-4a50-98d2-bf12be7ebaec';
const GOOD='a9025e59-1028-4502-bcc0-6cb062a87ac4';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result}
async function active(){const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id}
async function activate(id,msg){return api('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
async function check(url){const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'BALL46-Rollback-Check/1.0'},signal:AbortSignal.timeout(30000)});const t=await r.text();return {status:r.status,ray:r.headers.get('cf-ray')||'',body:t.slice(0,180)}}
const before=await active();console.log('BEFORE='+before);assert.equal(before,BAD,'ACTIVE_VERSION_DRIFT');
await activate(GOOD,'Rollback Android footer CTA after Worker 1101');
for(let i=0;i<25;i++){if(await active()===GOOD)break;await delay(1000)}
const after=await active();console.log('AFTER='+after);assert.equal(after,GOOD,'ROLLBACK_NOT_ACTIVE');
await delay(1500);
for(const u of ['https://ball46.com/','https://www.ball46.com/']){const x=await check(u);console.log(u+' STATUS='+x.status+' CF_RAY='+x.ray+' BODY='+JSON.stringify(x.body));assert(x.status<500,'SITE_STILL_5XX:'+u+':'+x.status)}
console.log('ROLLBACK_SUCCESS=1');

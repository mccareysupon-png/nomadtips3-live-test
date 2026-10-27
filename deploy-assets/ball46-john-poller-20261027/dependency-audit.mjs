// BALL46 safe read-only dependency and deployed-bundle inspection
// All Cloudflare calls are GET. Report only hashes, known feature markers and nonsecret binding names/services.
// Never emit source code, secrets, tokens, request headers or binding values.
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Audit credentials unavailable');
const BASE='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
const scriptList=['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-live-engine-5usd-shadow','nomadtips3-live-engine'];
const knownVersions={
 'ball46-production':'21c1519b-5874-412a-aea7-ebee2e057f46',
 'nomadtips3-5usd-hub-343':'98ea43ab-f40c-4de5-82e3-b0387dffd672',
 'nomadtips3-engine-343':'1f2336fa-7b45-4a23-a23c-06d01a92330d',
 'nomadtips3-full-market-343-ball46':'3a53ee1a-467c-4a20-9f50-ba749e8adab4',
 'nomadtips3-live-engine-5usd-shadow':'12d4c568-c795-42a8-9d99-4d680affddba',
 'nomadtips3-live-engine':'f20c833a-ba1d-4eca-be3b-3daa1aa63d3e'
};
async function get(url){
 try{
  const r=await fetch(BASE+url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
  const j=await r.json().catch(()=>null);
  return {ok:r.ok&&j?.success===true,data:j?.result||null,status:r.status,errorCodes:(j?.errors||[]).map(x=>x.code).slice(0,2)};
 }catch(e){return {ok:false,status:0,errorCodes:['network_error']};}
}
const scripts=await get('/workers/scripts');
const deployed=Array.isArray(scripts.data)?scripts.data:(scripts.data?.scripts||[]);
const names=deployed.map(x=>typeof x==='string'?x:String(x.id||x.name||'')).filter(Boolean);
const relevant=names.filter(s=>/nomad|ball46|sirius|football|fiveusd|5usd|goaloo/i.test(s));
const allSettings=[];
for(let i=0;i<names.length;i+=6){
 const items=await Promise.all(names.slice(i,i+6).map(async name=>{
  const r=await get('/workers/scripts/'+encodeURIComponent(name)+'/settings');
  if(!r.ok)return {name,ok:false,http:r.status};
  const bindings=(r.data?.bindings||[]).map(b=>({type:b.type||'',name:b.name||'',service:b.type==='service'?(b.service||''):undefined}));
  const links=bindings.filter(b=>b.type==='service').map(b=>({binding:b.name,to:b.service}));
  const secrets=bindings.filter(b=>b.type==='secret_text').map(b=>b.name);
  return {name,ok:true,links,secrets:secrets.length,has5USD:secrets.some(x=>/FIVEDOLLAR/i.test(x))};
 }));
 allSettings.push(...items);
}
const inbound=allSettings.flatMap(s=>(s.links||[]).filter(b=>scriptList.includes(b.to)||/shadow/i.test(b.to)).map(b=>({from:s.name,binding:b.binding,to:b.to})));
const direct5usd=allSettings.filter(x=>x.has5USD).map(x=>x.name);
const versions=[];
for(const name of scriptList){
 const id=knownVersions[name];
 const r=await get('/workers/scripts/'+encodeURIComponent(name)+'/versions/'+encodeURIComponent(id));
 const script=r.data?.resources?.script||{};
 const b=r.data?.resources?.bindings||{};
 versions.push({name,ok:r.ok,status:r.status,version:id,scriptEtag:script.etag||null,handlers:script.handlers||[],namedHandlers:(script.named_handlers||[]).map(x=>({name:x.name,handlers:x.handlers||[]})),source:r.data?.metadata?.source||null,contentHandlersAvailable:Boolean(script.handlers),bindingCount:Array.isArray(b)?b.length:Object.keys(b).length});
}
let content={};
try{
 const u='/workers/scripts/nomadtips3-live-engine-5usd-shadow/content/v2';
 const r=await fetch(BASE+u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 const bytes=Buffer.from(await r.arrayBuffer());
 const data=bytes.length<=5000000?bytes.toString('utf8'):'';
 content={ok:r.ok,status:r.status,sizeBytes:bytes.length,sha256:r.ok?createHash('sha256').update(bytes).digest('hex'):null,
  markers:r.ok?{
   hasCadence3000:/liveRefreshMs\\s*:\\s*3_000|FIVEUSD_LIVE_REFRESH_MS.{0,80}3000/.test(data),
   has50Page:/livePageSize\\s*:\\s*50|per_page=50/.test(data),
   hasOnDemand:/on_demand/.test(data),
   hasShadowLegacy:/FIVEUSD_SHADOW_LEGACY_DISABLED/.test(data),
   hasAlarmSource:/nextNativeAlarmAt|setAlarm/.test(data)
  }:null};
}catch(e){content={ok:false,reason:'content_read_failed'};}
const result={
 type:'BALL46_STEP1_DEPENDENCY_VERIFICATION',atUtc:new Date().toISOString(),
 listScripts:{ok:scripts.ok,http:scripts.status,count:names.length,relevant},
 settings:{tested:allSettings.length,success:allSettings.filter(s=>s.ok).length,failed:allSettings.filter(s=>!s.ok).map(x=>x.name),
    direct5USD:direct5usd,inbound},
 activeVersions:versions, shadowActiveContent:content
};
console.log('BALL46_DEPENDENCIES='+JSON.stringify(result));

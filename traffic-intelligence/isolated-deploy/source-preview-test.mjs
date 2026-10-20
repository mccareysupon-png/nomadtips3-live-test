// Temporary authenticated remote test only. Never changes production deployments.
// Inherits the existing read-only Analytics secret inside Cloudflare; returns no raw IPs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const account='62cb0db544160e6591342abd6b4f35cc',name='b46-visitor-monitor-admin';
const base=`/accounts/${account}/workers/scripts/${name}`,token=process.env.CLOUDFLARE_API_TOKEN;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function api(path,method='GET',body,extra={}){
 assert(path.startsWith(base)||path===`/accounts/${account}/workers/subdomain`);
 if(method!=='GET')assert(method==='POST'&&path===base+'/edge-preview','Production write denied');
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:`Bearer ${token}`,...extra},body,signal:AbortSignal.timeout(30000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('Cloudflare test HTTP '+r.status+' codes '+(j.errors||[]).map(e=>e.code).join(','));return j.result;
}
async function state(){const [deployment,settings,subdomain,schedules,versions]=await Promise.all([api(base+'/deployments'),api(base+'/settings'),api(base+'/subdomain'),api(base+'/schedules'),api(base+'/versions')]);return {deployment,settingsHash:hash(settings),subdomain,schedules,versionsHash:hash(versions)};}
const before=await state();assert.equal(before.deployment.deployments[0].versions[0].version_id,'10ab98eb-a7a4-4640-99b2-21b2f58b4b8b');
const nonce=randomUUID(),source=`export default {async fetch(req,env){
 if(req.headers.get('x-source-audit')!==${JSON.stringify(nonce)})return new Response('Denied',{status:403});
 async function gql(query){const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+env.CF_ANALYTICS_TOKEN,'content-type':'application/json'},body:JSON.stringify({query})});const j=await r.json();return {http:r.status,data:j.data,errors:j.errors?.map(e=>String(e.message).replace(/[A-Za-z0-9_-]{32,}/g,'[redacted]'))};}
 const zone='d491ee30b7a87a6c37e6a4dacf00ae8d';
 const settings=await gql('{viewer{zones(filter:{zoneTag:"'+zone+'"}){settings{httpRequestsAdaptive{enabled availableFields maxPageSize maxDuration notOlderThan}}}}}');
 const end=new Date(Date.now()-180000).toISOString(),start=new Date(Date.parse(end)-86400000).toISOString();
 const raw=await gql('{viewer{zones(filter:{zoneTag:"'+zone+'"}){httpRequestsAdaptive(limit:10,filter:{datetime_geq:"'+start+'",datetime_lt:"'+end+'",clientRequestHTTPHost_in:["ball46.com","www.ball46.com"],requestSource:"eyeball"},orderBy:[datetime_DESC]){clientIP clientCountryName datetime clientRequestHTTPHost clientRequestPath clientDeviceType userAgentBrowser edgeResponseStatus}}}}');
 const rows=raw.data?.viewer?.zones?.[0]?.httpRequestsAdaptive;
 const result={existingSecretPresent:!!env.CF_ANALYTICS_TOKEN,settings,dataProbe:{http:raw.http,errors:raw.errors,returned:Array.isArray(rows)?rows.length:null,hasIPv4:rows?.some(x=>/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(x.clientIP)),hasIPv6:rows?.some(x=>x.clientIP?.includes(':')),countries:rows?[...new Set(rows.map(x=>x.clientCountryName))]:null,onlyMainHosts:rows?.every(x=>['ball46.com','www.ball46.com'].includes(x.clientRequestHTTPHost))},rawRecordsSaved:false};
 return Response.json(result,{headers:{'cache-control':'no-store'}});
}};`;
const init=await api(base+'/subdomain/edge-preview');
let sessionToken=init.token;
if(init.exchange_url){const u=new URL(init.exchange_url);assert(u.protocol==='https:'&&(u.hostname.endsWith('.workers.dev')||u.hostname.endsWith('.cloudflareworkers.com')));const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(20000)});if(r.ok){try{const j=await r.json();if(j.token)sessionToken=j.token;}catch{}}}
const form=new FormData();form.set('metadata',new Blob([JSON.stringify({main_module:'probe.mjs',compatibility_date:'2026-10-01',bindings:[{name:'CF_ANALYTICS_TOKEN',type:'inherit',version_id:'latest'}]})],{type:'application/json'}));
form.set('probe.mjs',new Blob([source],{type:'application/javascript+module'}),'probe.mjs');form.set('wrangler-session-config',JSON.stringify({workers_dev:true}));
const preview=await api(base+'/edge-preview','POST',form,{'cf-preview-upload-config-token':sessionToken});
let host;
if(init.exchange_url){const h=new URL(init.exchange_url).hostname;host=name+h.slice(h.indexOf('.'));}
if(!host){const sub=await api(`/accounts/${account}/workers/subdomain`);host=name+'.'+sub.subdomain+'.workers.dev';}
const r=await fetch('https://'+host+'/',{headers:{'cf-workers-preview-token':preview.preview_token,'x-source-audit':nonce},redirect:'manual',signal:AbortSignal.timeout(30000)});
const result={checkedAt:new Date().toISOString(),temporaryAuthenticatedRemoteTest:true,productionUnchanged:true,http:r.status};
if(r.headers.get('content-type')?.includes('application/json'))result.probe=await r.json();
const after=await state();assert.deepEqual(after,before,'Production state changed during temporary remote test');
await mkdir('source-audit-evidence',{recursive:true});await writeFile('source-audit-evidence/existing-secret-probe.json',JSON.stringify(result,null,2));
console.log('EXISTING_SECRET_PROBE',JSON.stringify(result));
assert.equal(r.status,200,'Remote test requires authenticated access');
assert(result.probe?.dataProbe?.returned>0,'Existing Analytics token did not confirm IP source');

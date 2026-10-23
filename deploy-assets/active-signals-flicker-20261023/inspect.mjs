import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const worker='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('MISSING_CREDENTIALS');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function api(path){const res=await fetch(apiRoot+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)});const j=await res.json();if(!res.ok||j.success!==true)throw Error('CF_READ_FAILED_'+res.status);return j.result;}
const active=(await api('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];
const versionId=active.versions[0].version_id;
const version=await api('/workers/workers/'+worker+'/versions/'+versionId+'?include=modules');
const body=Buffer.from(version.modules.find(m=>m.name===version.main_module).content_base64,'base64').toString();
const htmlRes=await fetch('https://ball46.com/?activeSignalsAudit='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});
const html=await htmlRes.text();
const terms=/active[\s_-]*signals|activeSignals|activeSignal|feature[ds]?[-_\s]?signals?|signal-card|signalCard|live-prediction|Signal 44|asian handicap|1X2|s[-_]?signal/gi;
function scan(src,limit=75){const matches=[];let m;terms.lastIndex=0;while((m=terms.exec(src))&&matches.length<limit){matches.push({index:m.index,text:m[0],context:src.slice(Math.max(0,m.index-650),Math.min(src.length,m.index+1000))});}return matches;}
const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
const styles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
const reports={at:new Date().toISOString(),activeVersion:versionId,deployment:active.id,htmlSha:sha(Buffer.from(html)),htmlStatus:htmlRes.status,mainSha:sha(Buffer.from(body)),scripts,styles,htmlMatches:scan(html,85),workerMatches:scan(body,40),external:{}};
for(const p of [...scripts,...styles].filter(x=>!x.includes('http')).slice(0,75)){
 try{const url=new URL(p,'https://ball46.com/'),r=await fetch(url,{signal:AbortSignal.timeout(13000)});if(!r.ok)continue;const type=r.headers.get('content-type')||'';if(!/(javascript|css|text)/.test(type))continue;const s=await r.text(),m=scan(s,15);if(m.length)reports.external[p]={status:r.status,sha:sha(Buffer.from(s)),bytes:s.length,matches:m};
 }catch(e){reports.external[p]={error:String(e)}}}
await mkdir('audit',{recursive:true});await writeFile('audit/active-signals-source.json',JSON.stringify(reports,null,2));
console.log('BALL46_SIGNALS_AUDIT='+JSON.stringify({...reports,workerMatches:reports.workerMatches.slice(0,15),htmlMatches:reports.htmlMatches.slice(0,30),external:Object.fromEntries(Object.entries(reports.external).map(([p,v])=>[p,{...v,matches:v.matches?.slice(0,8)}]))}).slice(0,95000));

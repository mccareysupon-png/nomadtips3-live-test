import {mkdir,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('NO_ACCOUNT_TOKEN');
const cf=async path=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_GET_'+r.status);return j.result};
const deployments=(await cf('/workers/scripts/ball46-production/deployments?per_page=1')).deployments,live=deployments[0];
const version=await cf('/workers/workers/ball46-production/versions/'+live.versions[0].version_id+'?include=modules');
const main=Buffer.from(version.modules.find(x=>x.name===version.main_module).content_base64,'base64');
async function fetchUrl(path){const u=new URL(path,'https://ball46.com/');u.searchParams.set('b46EmptyAudit',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{code:r.status,sha:sha(b),body:b.toString(),mime:r.headers.get('content-type')};}
const h=await fetchUrl('/');
const scriptPaths=[...h.body.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(x=>x[1]);
const terms=['No active signal','No active signals','feature-empty','data-featured-signal','feature-signal','ACTIVE SIGNALS','signal-count'];
function hits(src,words=terms,cap=12){let all=[];for(const term of words){let n=-1,c=0;while((n=src.toLowerCase().indexOf(term.toLowerCase(),n+1))>=0&&c++<cap){all.push({term,index:n,context:src.slice(Math.max(0,n-420),Math.min(src.length,n+term.length+680))});}}return all.sort((a,b)=>a.index-b.index).slice(0,75);}
const result={time:new Date().toISOString(),active:live.versions[0].version_id,deployment:live.id,mainSha:sha(main),htmlSha:h.sha,html: hits(h.body,terms,8),scripts:[],worker:hits(main.toString(),['No active signal','feature-empty'],4)};
for(const p of scriptPaths){if(!p.startsWith('http')){try{const s=await fetchUrl(p),m=hits(s.body,['No active signal','No active signals','feature-empty','patchFeatureSignalHost','visibleSignalsFor','function clearFeatured','signalMap'],4);if(m.length)result.scripts.push({path:p,sha:s.sha,bytes:s.body.length,hits:m});}catch(e){result.scripts.push({path:p,error:String(e)})}}}
await mkdir('audit',{recursive:true});await writeFile('audit/investigate.json',JSON.stringify(result,null,2));
const brief={active:result.active,deployment:result.deployment,mainSha:result.mainSha,htmlSha:result.htmlSha,html:result.html.filter(x=>['No active signal','No active signals','feature-empty'].includes(x.term)).slice(0,12),scripts:result.scripts.map(x=>({path:x.path,sha:x.sha,bytes:x.bytes,hits:x.hits?.filter(z=>['No active signal','No active signals','feature-empty','patchFeatureSignalHost'].includes(z.term)).slice(0,4)})),worker:result.worker};
console.log('B46_EMPTY_AUDIT='+JSON.stringify(brief).slice(0,21000));

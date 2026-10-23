import {createHash} from'node:crypto';
import{mkdir,writeFile}from'node:fs/promises';
const sha=x=>createHash('sha256').update(x).digest('hex'),w='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN; if(!account||!token)throw Error('CREDENTIALS_REQUIRED');
async function api(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CLOUDFLARE_READ_'+r.status);return j.result;}
const active=(await api('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0],version=await api('/workers/workers/'+w+'/versions/'+active.versions[0].version_id+'?include=modules');
const main=version.modules.find(m=>m.name===version.main_module),src=Buffer.from(main.content_base64,'base64');
const base='https://ball46.com',target='/dashboard-v2-stage3-featured-facts-20261013a.js';
async function get(p){const url=new URL(p,base);url.searchParams.set('sigAtomicAudit',Date.now());const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return {status:r.status,sha:sha(b),contentType:r.headers.get('content-type'),bytes:b};}
const [h,j,icon,robots]=await Promise.all([get('/'),get(target),get('/favicon-192.png'),get('/robots.txt')]);
const html=h.bytes.toString(),js=j.bytes.toString();
const getExcerpt=(s,needle,before=80,after=1600)=>{let i=s.indexOf(needle);return i<0?'NOT_FOUND':s.slice(Math.max(0,i-before),i+needle.length+after)};
const scriptTag=[...html.matchAll(/<script\b[^>]*src=["'][^"']*featured-facts[^"']*["'][^>]*>/gi)].map(x=>x[0]);
const css=html.slice(html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">'),html.indexOf('</style>',html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">'))+8);
const matches=[...css.matchAll(/data-v11-kind|data-v11-count|data-v11-label|data-v11-value/g)].map(x=>({at:x.index,type:x[0],excerpt:css.slice(Math.max(0,x.index-200),x.index+340)}));
const report={time:new Date().toISOString(),active:{deployment:active.id,version:active.versions},worker:{mainModule:version.main_module,mainSha:sha(src),moduleCount:version.modules.length,assets:version.assets?.config},html:{status:h.status,sha:h.sha,length:h.bytes.length,scriptTags:scriptTag},js:{status:j.status,sha:j.sha,length:j.bytes.length,contentType:j.contentType},faviconSha:icon.sha,robotsSha:robots.sha,functions:{signalDetailsHtml:getExcerpt(js,'function signalDetailsHtml(s)',0,1800),newFeatureSignalParts:getExcerpt(js,'function newFeatureSignalParts(s,key)',0,950),newFeatureSignalDivider:getExcerpt(js,'function newFeatureSignalDivider(key)',0,400),patchFeatureSignalHost:getExcerpt(js,'function patchFeatureSignalHost(host,sigs,emptyHtml)',0,2600)},css:{attributeSelectors:matches.slice(0,45)},v11:getExcerpt(html,'<script id="b46-featured-faithful-v11-20261021"',0,4200)};
await mkdir('audit',{recursive:true});await writeFile('audit/live.json',JSON.stringify(report,null,2));
console.log('B46_ATOMIC_BASE='+JSON.stringify({active:report.active,worker:report.worker,html:report.html,js:report.js,functions:report.functions,css:{attributeSelectors:matches.slice(0,16)},v11:report.v11}).slice(0,18500));

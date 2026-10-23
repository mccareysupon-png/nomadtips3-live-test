import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const sha=b=>createHash('sha256').update(b).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,worker='ball46-production';
if(!account||!token)throw Error('MISSING_CLOUDFLARE_AUDIT_CREDENTIALS');
const output={audit:'BALL46_FAVICON_SEO_READONLY_20261023',at:new Date().toISOString(),worker,domains:{},files:{},warnings:[]};
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||j.success!==true)throw Error('CF_API_READ_ERROR_'+r.status+'_'+JSON.stringify(j.errors).slice(0,200));return j.result;}
async function publicRead(domain,path){const u='https://'+domain+path+(path.includes('?')?'&':'?')+'faviconSeoAudit='+Date.now();
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(35000),redirect:'follow'});const b=Buffer.from(await r.arrayBuffer());return {status:r.status,contentType:r.headers.get('content-type'),length:b.length,sha:sha(b),url:r.url,buffer:b};}
const tags=(h,re)=>[...h.matchAll(re)].map(x=>x[0].slice(0,900));
try{
 const d=await cf('/workers/scripts/'+worker+'/deployments?per_page=1');const active=d.deployments?.[0];
 output.deployment={id:active?.id,versions:active?.versions,created_on:active?.created_on};
 const domains=(await cf('/workers/domains')).filter(x=>x.service===worker).map(x=>x.hostname).sort();
 output.cloudflareDomains=domains;
 const a=active?.versions?.[0]?.version_id;if(a){const v=await cf('/workers/workers/'+worker+'/versions/'+a+'?include=modules');output.version={id:a,mainModule:v.main_module,moduleNames:v.modules?.map(x=>x.name),assetsPresent:!!v.assets,assetConfig:v.assets?.config,compatibilityDate:v.compatibility_date,annotations:v.annotations};
 const m=v.modules?.find(x=>x.name===v.main_module);if(m){const src=Buffer.from(m.content_base64,'base64').toString('utf8');output.version.sourceSha=sha(Buffer.from(src));output.version.sourceBytes=Buffer.byteLength(src);output.version.hasSignalHeading=src.includes('__b46SignalHeadingHtml20261023');output.version.hasFaviconOverride=src.includes('__b46Fav192B6420261023');output.version.hasPriorSEO=src.includes('Live Football Scores');}}
 for(const hostname of ['ball46.com','www.ball46.com']){
  for(const path of ['/','/index.html','/favicon.ico','/favicon-192.png','/robots.txt']){
   try{const x=await publicRead(hostname,path);const key=hostname+path;output.files[key]={status:x.status,type:x.contentType,length:x.length,sha:x.sha,url:x.url};
    if(x.contentType?.includes('html')&&(path==='/'||path==='/index.html')){
      const h=x.buffer.toString('utf8').split(/<\/head>/i)[0].slice(0,25000);
      output.files[key].title=tags(h,/<title[^>]*>[\s\S]*?<\/title>/gi).slice(0,3);
      output.files[key].meta=tags(h,/<meta\b[^>]*(?:name=["']description["']|property=["']og:(?:title|description|site_name)["'])[^>]*>/gi).slice(0,8);
      output.files[key].icons=tags(h,/<link\b[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/gi).slice(0,8);
      output.files[key].canonical=tags(h,/<link\b[^>]*rel=["']canonical["'][^>]*>/gi).slice(0,5);
      output.files[key].siteNames=tags(h,/["']name["']\s*:\s*["'][^"']+["']/gi).slice(0,8);
      output.files[key].hasLiveBettingTips=h.includes('Live Betting Tips');
      output.files[key].headStart=h.slice(0,2200);
    }
    if(path==='/robots.txt')output.files[key].body=x.buffer.toString().slice(0,1500);
    if(path==='/favicon.ico'&&x.length<25000)output.files[key].faviconBase64=x.buffer.toString('base64');
    if(path==='/favicon-192.png'&&x.length<35000)output.files[key].faviconBase64=x.buffer.toString('base64');
   }catch(e){output.files[hostname+path]={error:e.message};output.warnings.push(hostname+path+': '+e.message);}
  }
 }
}catch(e){output.error=e.message;process.exitCode=1;}
await mkdir('audit',{recursive:true});
await writeFile('audit/production-favicon-seo.json',JSON.stringify(output,null,2));
const brief=structuredClone(output);for(const v of Object.values(brief.files)){if(v.faviconBase64)delete v.faviconBase64;}
console.log('BALL46_AUDIT_JSON='+JSON.stringify(brief));
for(const [key,value] of Object.entries(output.files)){if(value.faviconBase64)console.log('BALL46_FAVICON_BASE64 '+key+' '+value.faviconBase64);}

import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_CREDENTIALS_UNAVAILABLE');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){
 const r=await fetch(root+path,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 assert(r.ok&&j.success===true,'CF_GET_FAILED_'+r.status);
 return j.result;
}
const deployments=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const vers=deployments.deployments?.[0]?.versions||[];
assert(vers.length===1&&Number(vers[0].percentage)===100,'NOT_SINGLE_100_PERCENT_ACTIVE');
const active=vers[0].version_id;
const current=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const names=current.modules.map(x=>x.name);
const module=current.modules.find(x=>x.name==='assets/index.html');
let assetHtml='';
if(module?.content_base64)assetHtml=Buffer.from(module.content_base64,'base64').toString('utf8');
const find=(s,re)=>{const x=s.match(re);return x?.[1]?.trim()||null};
function headInfo(html){
 const head=find(html,/<head\b[^>]*>([\s\S]*?)<\/head>/i)||html.slice(0,250000);
 return {
  title:find(head,/<title\b[^>]*>([\s\S]*?)<\/title>/i),
  description:find(head,/<meta\s+name=["']description["']\s+content=["']([^"']*)/i) || find(head,/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i),
  canonical:find(head,/<link\s+rel=["']canonical["']\s+href=["']([^"']*)/i),
  robots:find(head,/<meta\s+name=["']robots["']\s+content=["']([^"']*)/i),
  ogSite:find(head,/<meta\s+property=["']og:site_name["']\s+content=["']([^"']*)/i),
  containsNomadBrandInHead:/nomadtips3/i.test(head),
  hasJsonLd:/application\/ld\+json/i.test(head),
  hasHreflang:/hreflang=/i.test(head)
 };
}
async function publicGet(path){
 const url='https://ball46.com'+path;
 try{
  const r=await fetch(url,{method:'GET',headers:{'User-Agent':'BALL46-SEO-ReadOnly-Audit/1.0','cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  const t=await r.text();
  return {status:r.status,contentType:r.headers.get('content-type'),length:t.length,body:path==='/'?headInfo(t):{hasBall46:t.includes('ball46.com'),hasNomad:t.includes('nomadtips3.com'),snippet:t.slice(0,700)}};
 }catch(e){return {error:String(e?.message||e).slice(0,140)}}
}
const [homepage,robots,sitemap]=await Promise.all([publicGet('/'),publicGet('/robots.txt'),publicGet('/sitemap.xml')]);
console.log('SEO_RUNTIME_AUDIT='+JSON.stringify({
 worker:SCRIPT,active,main:current.main_module,moduleCount:current.modules.length,
 hasAssetHtml:!!module,assetHtmlLength:assetHtml.length,asset:headInfo(assetHtml),
 homepage,robots,sitemap
}));
console.log('READ_ONLY=1; ALL_CLOUDFLARE_CALLS=GET; NO_DEPLOY=1');

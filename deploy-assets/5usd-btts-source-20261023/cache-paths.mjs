import{mkdir,writeFile}from'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('NO_CREDS');
const api=async p=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_API_'+r.status);return j.result};
const w='nomadtips3-full-market-343-ball46',id=(await api('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const version=await api('/workers/workers/'+w+'/versions/'+id+'?include=modules'),code=Buffer.from(version.modules.find(m=>m.name===version.main_module).content_base64,'base64').toString();
const needles=['function sanitizeProviderPayload','function mergeLastGood','function mergeFullOdds','function routeOf','async fetch(request','case "/board-cache"','route === "/board-cache"','route === "/fixture-odds"','route === "/prewarm"','cacheOnly','cache:','return json(','function normalizePayload'];
const out={version:id,length:code.length,functions:[]};for(const n of needles){let at=-1,count=0;while((at=code.indexOf(n,at+1))>=0&&count++<4){let snippet=code.slice(Math.max(0,at-120),Math.min(code.length,at+2300));snippet=snippet.replace(/authorization:\s*[^,}\n]{30,}/gi,'authorization:[REDACTED]').replace(/[A-Za-z0-9+/_-]{110,}/g,'[LONG_REDACTED]');out.functions.push({needle:n,at,source:snippet.slice(0,2300)})}}
await mkdir('audit',{recursive:true});await writeFile('audit/fullmarket-cache-paths.json',JSON.stringify(out,null,2));
console.log('B46_FM_CACHE_PATHS='+JSON.stringify({version:id,length:code.length,functions:out.functions.map(x=>({...x,source:x.source.slice(0,1650)}))}).slice(0,21000));

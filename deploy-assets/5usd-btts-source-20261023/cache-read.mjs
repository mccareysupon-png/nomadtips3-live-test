const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('NO_CREDS');
const api=async p=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF:'+r.status);return j.result};
const id=(await api('/workers/scripts/nomadtips3-full-market-343-ball46/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await api('/workers/workers/nomadtips3-full-market-343-ball46/versions/'+id+'?include=modules');
const src=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
for(const term of ['async cacheSnapshot(','async prewarm(','async getCache(','async readCache(','async loadDeduped(']){let at=src.indexOf(term);if(at>=0)console.log('B46_FM_FUNCTION='+JSON.stringify({name:term,source:src.slice(at,at+2400).replace(/authorization:[^,\n]{25,}/g,'authorization:[redacted]')}));}

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/storage/kv/namespaces?per_page=100',{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(30000)});
const j=await r.json().catch(()=>null);
console.log('B46_V5_KV_READ='+JSON.stringify({status:r.status,success:j?.success,namespaces:(j?.result||[]).map(x=>({id:x.id,title:x.title})).filter(x=>/vote|ball46|prediction/i.test(x.title)).slice(0,40),errors:j?.errors}).slice(0,3800));

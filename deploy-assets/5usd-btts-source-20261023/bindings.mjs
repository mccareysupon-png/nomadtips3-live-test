import {mkdir,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('NO_CREDS');
async function api(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||j.success!==true)throw Error('API_'+r.status);return j.result;}
const all=await api('/workers/scripts?per_page=100'),names=Array.isArray(all)?all.map(x=>x.id||x.name):[];
const relevant=names.filter(x=>/full|market|odds|5usd|hub|ball46|engine/i.test(x));
const workers=[];for(const worker of relevant){try{const s=await api('/workers/scripts/'+worker+'/settings');workers.push({worker,bindings:(s.bindings||[]).map(x=>({name:x.name,type:x.type,service:x.service,environment:x.environment})).filter(x=>x.type!=='secret_text'||x.name==='FIVEDOLLAR_API_KEY')})}catch(e){workers.push({worker,error:String(e.message||e)})}}
let origin;
try{const r=await fetch('https://ball46.com/api/full-market/health?verifySource='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});origin={status:r.status,data:await r.json()};}catch(e){origin={error:String(e.message||e)}}
const out={at:new Date().toISOString(),workerNames:relevant,workers,fullMarketHealth:origin};
await mkdir('audit',{recursive:true});await writeFile('audit/fullmarket-binding.json',JSON.stringify(out,null,2));
console.log('B46_FULLMARKET_BINDING='+JSON.stringify({names:relevant,workers,health:origin.status===200?{component:origin.data.component,version:origin.data.version,mode:origin.data.mode,bookmakerCount:origin.data.bookmakerCount,providerMeta:origin.data.providerMeta,presets:origin.data.presets,prewarmMeta:origin.data.prewarmMeta}:origin}).slice(0,21000));

import assert from 'node:assert/strict';
const A='62cb0db544160e6591342abd6b4f35cc',W='nomadtips3-engine-343';
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)}),j=await r.json();assert(r.ok&&j.success,'CF_'+r.status);return j.result}
const sub=await cf('/workers/scripts/'+W+'/subdomain');
const routes=(await cf('/workers/domains')).filter(x=>x.service===W).map(x=>x.hostname);
let direct=null;
if(sub.enabled){
 const url='https://'+W+'.mccarey-supon.workers.dev/statistics?'+new URLSearchParams({paged:'1',cursor:'stat:v2:row:\uffff',limit:'500'});
 const r=await fetch(url,{redirect:'error',headers:{'cache-control':'no-store'},signal:AbortSignal.timeout(20000)});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={sample:text.slice(0,120)}}
 direct={url,status:r.status,ok:data.ok,pagination:data.statisticsPagination,returned:data.rows?.length,error:data.error};
}
console.log('ENGINE_DIRECT_PROBE '+JSON.stringify({subdomain:sub,routes,direct,productionWrites:0,providerRequests:0}));

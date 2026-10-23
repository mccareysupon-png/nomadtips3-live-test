import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{Authorization:'Bearer '+T},signal:AbortSignal.timeout(45000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF'+r.status);return j.result}
const ids=['8867d39d-f381-4261-8d05-5b429926353b','9f0b9a92-6a1f-402e-9ff6-a428ae591080','50f65def-f4a1-4172-8dd4-ac3c7bb82209'];
let versions=[];
for(const id of ids){const v=await cf('/workers/workers/ball46-production/versions/'+id+'?include=modules'),s=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 let spans=[],tokens=['async function activeSignals(','function activeSignals(','async function engineBoardResponse(','function engineBoardResponse(','hiddenPendingSignals','ENGINE_BOARD_LIVE'];
 for(const t of tokens){const i=s.indexOf(t);if(i>=0)spans.push({token:t,at:i,body:s.slice(i,i+(t.includes('function')?4900:700))})}
 versions.push({id,spans:spans.map(x=>({...x,sha:createHash('sha256').update(x.body).digest('hex'),body:x.body.slice(0,x.token.includes('function')?2400:650)}))});
}
console.log('B46_PROXY_CONCISE='+JSON.stringify(versions).slice(0,15800));

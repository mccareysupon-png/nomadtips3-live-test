// Cloudflare route/subdomain audit. GET only, no DNS or script mutations.
// Does not print account IDs or secrets, only explicit Worker route mappings.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Missing audit credentials');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function get(path){try{const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers,signal:AbortSignal.timeout(20000)});const j=await r.json().catch(()=>({}));return {ok:r.ok&&j.success===true,http:r.status,result:j.result||[],errors:(j.errors||[]).map(x=>x.code)};}catch{return {ok:false,http:0,result:[]}}}
const target=['ball46-production','nomadtips3-live-engine-5usd-shadow','nomadtips3-live-engine-5dollar','nomadtips3-live-engine','nomadtips3-5usd-hub-343','ball46-member-production','nomadtips3-live-web-production'];
const subdomains=[];
for(const name of target){
 const q=await get('/accounts/'+encodeURIComponent(account)+'/workers/scripts/'+encodeURIComponent(name)+'/subdomain');
 subdomains.push({script:name,http:q.http,ok:q.ok,workersDevEnabled:q.result?.enabled??null});
}
const zones=[];
for(const name of ['ball46.com','nomadtips3.com']){
 const z=await get('/zones?name='+encodeURIComponent(name));
 const items=Array.isArray(z.result)?z.result:[];
 const found=items.find(x=>x.name===name);
 if(!found){zones.push({domain:name,ok:false,http:z.http,zonesFound:items.length});continue;}
 const routes=await get('/zones/'+encodeURIComponent(found.id)+'/workers/routes');
 const rows=Array.isArray(routes.result)?routes.result:[];
 zones.push({domain:name,ok:routes.ok,http:routes.http,routes:rows.filter(x=>target.includes(x.script)||/shadow|5usd|341|343|member/i.test(x.script||'')).map(x=>({pattern:x.pattern,script:x.script})),routeCount:rows.length});
}
console.log('BALL46_ROUTE_AND_URL_AUDIT='+JSON.stringify({readOnly:true,asOfUtc:new Date().toISOString(),subdomains,zones}));

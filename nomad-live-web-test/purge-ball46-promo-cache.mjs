import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN;
const headers={Authorization:'Bearer '+token,'content-type':'application/json'};
async function cf(url,options={}){const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR '+r.status+' '+JSON.stringify(j.errors||j));return j.result}
const zones=await cf('https://api.cloudflare.com/client/v4/zones?name=nomadtips3.com&status=active');
assert(zones.length===1,'ZONE_NOT_UNIQUE');
const zone=zones[0];
console.log('ZONE='+zone.id);
const files=[
 'https://www.nomadtips3.com/',
 'https://www.nomadtips3.com/index.html',
 'https://www.nomadtips3.com/assets/ball46-top-banner.webp',
 'https://www.nomadtips3.com/assets/ball46-banner-20261112-v2.webp'
];
await cf('https://api.cloudflare.com/client/v4/zones/'+zone.id+'/purge_cache',{method:'POST',body:JSON.stringify({files})});
console.log('PURGED='+files.join(','));
console.log('PURGE_SUCCESS=1');

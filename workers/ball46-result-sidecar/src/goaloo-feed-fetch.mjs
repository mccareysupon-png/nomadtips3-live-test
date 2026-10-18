/**
 * Cloudflare-compatible Goaloo source fetch.
 * Use manual redirect handling: Cloudflare Workers do not implement
 * redirect:'error'. Never follow a source redirect to another host.
 */
export async function fetchGoaloo(fetcher=fetch){
 for(const url of [
  'https://live10.goaloo28.com/gf/data/bf_us.js',
  'https://live10.goaloo28.com/gf/data/bf_us1.js'
 ]){
  try{
   const response=await fetcher(url,{redirect:'manual',
    signal:AbortSignal.timeout(15000)});
   if(!response.ok)continue;
   const length=Number(response.headers.get('content-length')||0);
   if(length>4_000_000)continue;
   const raw=await response.text();
   if(raw.length<=4_000_000&&raw.includes('A['))return raw;
  }catch{}
 }
 throw Error('GOALOO_FEED_UNAVAILABLE');
}

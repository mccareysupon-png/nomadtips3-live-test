/** Ball46 John/5Dollar price admission. STAGING ONLY, not wired to Production. */
export const VERIFIED_MARKETS=Object.freeze({
  ft_over:'goalline',ft_under:'goalline',
  ht_over:'goalline_half',ht_under:'goalline_half',
  ft_corner_over:'corner',ft_corner_under:'corner',
  ht_corner_over:'corner_half',ht_corner_under:'corner_half',
  ft_corner_ah:'corner_asian'
});
/**
 * Candidates MUST already have passed the current Signal conditions against shared Bulk.
 * This planner makes NO network calls. The single account-wide gate owns all detailed requests.
 * One request is shared across Over & Under of one market; never one request per Signal side.
 */
export function planPriceRequests({candidates=[],providerRemaining,headroomForBulk=8,maximum=3,retryAfterSec=0,cursor=0}){
  if(!Array.isArray(candidates))throw Error('INVALID_ELIGIBLE_CANDIDATES');
  const seen=new Set(),eligible=[];
  for(const c of candidates){
    if(!c?.qualified||!VERIFIED_MARKETS[c.market]||!c.fixtureId)continue;
    const market=VERIFIED_MARKETS[c.market],bookmaker=String(c.bookmaker||'bet365').toLowerCase();
    const key=String(c.fixtureId)+'|'+market+'|'+bookmaker;
    if(seen.has(key))continue;
    seen.add(key);
    eligible.push({fixtureId:String(c.fixtureId),market,bookmaker,cacheKey:key});
  }
  const n=eligible.length,offset=n?((Math.trunc(cursor)%n)+n)%n:0;
  const roundRobin=eligible.slice(offset).concat(eligible.slice(0,offset));
  // Provider X-RateLimit-Remaining is shared across ALL keys; unknown means no calls.
  const free=Number.isFinite(providerRemaining)?Math.max(0,Math.floor(providerRemaining)-headroomForBulk):0;
  const budget=retryAfterSec>0?0:Math.max(0,Math.min(maximum,free));
  return {requests:roundRobin.slice(0,budget),deferred:roundRobin.slice(budget),
    nextCursor:n?(offset+Math.max(1,budget))%n:0,externalRequestsPlanned:Math.min(budget,n)};
}
/** Return a quote only when a verified last price tick belongs to exact fixture/book/market. */
export function verifyTick(payload,{fixtureId,market,bookmaker='bet365',fixtureMinute,now,maxAgeMs=90000}){
  const d=payload?.data;
  if((payload?.success!==true&&payload?.success!==1)||payload?.pagination?.has_more!==false||
     String(d?.fixture_id??'')!==String(fixtureId)||d?.market!==market||
     String(d?.bookmaker?.slug??'').toLowerCase()!==bookmaker.toLowerCase()||
     !Array.isArray(d?.ticks)||!d.ticks.length)return null;
  const ticks=[...d.ticks].sort((a,b)=>Date.parse(String(a?.recorded_at??''))-Date.parse(String(b?.recorded_at??'')));
  const t=ticks.at(-1),when=Date.parse(String(t?.recorded_at??''));
  if(!Number.isFinite(when)||when>now+5000||now-when>maxAgeMs||
     t?.suspended===true||t?.half_time===true||
     !Number.isFinite(Number(fixtureMinute))||!Number.isFinite(Number(t?.minute))||
     Math.abs(Number(fixtureMinute)-Number(t.minute))>5)return null;
  const a=market==='corner_asian'?'home':'over',b=market==='corner_asian'?'away':'under';
  if(t.line==null||t[a]==null||t[b]==null)return null;
  const line=Number(t.line),first=Number(t[a]),second=Number(t[b]);
  if(!Number.isFinite(line)||Math.abs(line*4-Math.round(line*4))>1e-6||
     (market!=='corner_asian'&&line<0)||!Number.isFinite(first)||!Number.isFinite(second)||
     first<=1||second<=1)return null;
  return {fixtureId:String(fixtureId),bookmaker:bookmaker.toLowerCase(),market,line,
    [a]:first,[b]:second,recordedAt:t.recorded_at,ageMs:now-when};
}
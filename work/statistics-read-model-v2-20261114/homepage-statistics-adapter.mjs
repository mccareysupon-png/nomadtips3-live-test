// Replace only Statistics data consumers. All formulas, CSS, promo and match UI stay unchanged.
import assert from 'node:assert/strict';
function once(s,a,b,label){assert.equal(s.split(a).length,2,'ACTIVE_CONSUMER_DRIFT:'+label);return s.replace(a,()=>b)}
export function patchScorebarStatistics(source){
 const before='const j=await window.BALL46_STATISTICS_DATA.load();settledSignalRows=j.rows.slice().sort((a,b)=>Number(b?.settledAt||b?.createdAt||0)-Number(a?.settledAt||a?.createdAt||0));';
 const after="const j=await window.BALL46_STATISTICS_FAST.getSummary();if(!Array.isArray(j.recentSettled)||j.recentSettled.length>4)throw Error('UNVERIFIED_RECENT_SETTLEMENTS');settledSignalRows=j.recentSettled;";
 const candidate=once(source,before,after,'Recent four settled rows');
 assert.equal(candidate.replace(after,before),source,'UNRELATED_DASHBOARD_BYTES_CHANGED');return candidate;
}
export function patchHomepageStatistics(html){
 const match=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes("const CACHE_KEY='b46:daily-performance:shared:v1'"));assert(match,'ACTIVE_DAILY_WIDGET_MISSING');
 const before=match[1],a=before.indexOf('function consume(data){'),b=before.indexOf('function cutoffStamp(',a);assert(a>0&&b>a,'ACTIVE_DAILY_CONSUMER_DRIFT');
 const consume=`function consumeFast(data){try{const api=window.BALL46_STATISTICS_FAST,d=data?.daily;if(!api?.peekSummary||data!==api.peekSummary()||!data.ok||!d||!validBucket(d.today)||!validBucket(d.yesterday)||d.tk!==sportDay(Date.now())||d.yk!==prev(d.tk))return;const stamp=Number(data.verifiedAt);if(!Number.isFinite(stamp)||stamp<=0||stamp>Date.now()+60000)return;lastSnapshot=data;lastGood=d;verifiedAt=stamp;sourceMode=data.stale?'cache':'snapshot';render(lastGood);cacheWrite();clearTimeout(ageTimer);ageTimer=setTimeout(()=>{const r=document.getElementById(ID);if(r&&lastGood)freshness(r)},Math.max(1000,verifiedAt+STALE_MS-Date.now()+1))}catch(e){console.warn('Performance summary unavailable:',e.message)}}\n`;
 let script=before.slice(0,a)+consume+before.slice(b);
 script=once(script,"document.addEventListener('ball46:statistics-snapshot',e=>consume(e.detail))","document.addEventListener('ball46:statistics-fast-summary',e=>consumeFast(e.detail))",'Daily summary subscription');
 const old='consume(window.BALL46_STATISTICS_DATA?.getSnapshot?.())',fresh='consumeFast(window.BALL46_STATISTICS_FAST?.peekSummary?.())';assert.equal(script.split(old).length,3,'DAILY_BOOT_CONSUMER_DRIFT');script=script.split(old).join(fresh);
 // The exact aggregate/rate/odds and paint functions preceding consume remain untouched.
 assert.equal(script.slice(0,a),before.slice(0,a),'DAILY_FORMULA_OR_MARKUP_CHANGED');
 const candidate=html.replace(before,()=>script);assert.equal(candidate.replace(script,before),html,'UNRELATED_HTML_BYTES_CHANGED');return candidate;
}

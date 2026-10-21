const path='/dashboard-v2-stage3-featured-facts-20261013a.js';
const src=await (await fetch('https://ball46.com'+path+'?feature_signal_audit='+Date.now(),{cache:'no-store'})).text();
for(const needle of ['data-featured-signal','function renderFeatured','signal-card','feature-signal','signal-chip','renderSignal','Line','Bet365','feature-stats']){
  let start=0,n=0;
  while((start=src.indexOf(needle,start))>=0&&n<6){console.log('B46_FEATURED_SOURCE',JSON.stringify({needle,at:start,context:src.slice(Math.max(0,start-400),Math.min(src.length,start+1800))}));start+=needle.length;n++;}
}
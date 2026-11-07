const urls=['https://ball46.com/?titleBaseline='+Date.now(),'https://ball46-production.mccarey-supon.workers.dev/?titleBaseline='+Date.now()];
for(const u of urls){
  const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  const t=await r.text();
  const m=t.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  console.log('URL='+u);
  console.log('HTTP='+r.status);
  console.log('TITLE='+(m?m[1]:'NO_TITLE'));
  console.log('HAS_BETTING='+t.includes('BALL46 | Live Betting Tips, Football Scores &amp; Signals'));
  console.log('HAS_PREDICTIONS='+t.includes('BALL46 | Live Predictions, Football Scores &amp; Signals'));
}

const u='https://ball46.com/full-market-bookmaker-343.js?pattern-audit='+Date.now();
const r=await fetch(u,{headers:{'cache-control':'no-cache'}});
const s=await r.text();
if(!r.ok)throw new Error('HTTP_'+r.status);
for(const key of ['function shellHtml','function update(','function chooseBook(','data-fmb-panel','fmb-head']){
  const i=s.indexOf(key);
  console.log('\n### '+key+' @ '+i);
  console.log(i>=0?s.slice(Math.max(0,i-500),i+3500):'NOT_FOUND');
}
console.log('LAZY_MARKER='+s.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110'));
console.log('PERF_MARKER='+s.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'));

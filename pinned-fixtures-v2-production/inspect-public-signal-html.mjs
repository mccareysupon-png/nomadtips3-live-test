const r=await fetch('https://ball46.com/?signal-public-inspect='+Date.now(),{headers:{'cache-control':'no-cache'}});
const t=await r.text();
console.log('STATUS='+r.status+' LEN='+t.length);
for(const term of ['b46-league-market-js-20261023','if(!row||!head)continue','b46-league-market-signal-count']){const i=t.indexOf(term);console.log('PUBLIC='+term+' INDEX='+i+' CTX='+JSON.stringify(i>=0?t.slice(Math.max(0,i-1200),Math.min(t.length,i+3500)):'NOT_FOUND'));}
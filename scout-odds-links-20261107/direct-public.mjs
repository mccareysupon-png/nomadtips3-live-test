import assert from 'node:assert/strict';
const urls=[
 'https://ball46.com/full-market-bookmaker-343.js?v=text-only-20261018',
 'https://www.ball46.com/full-market-bookmaker-343.js?v=text-only-20261018'
];
for(const url of urls){
 const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
 console.log('URL='+url);console.log('HTTP='+r.status);console.log('TYPE='+(r.headers.get('content-type')||''));
 const t=await r.text();
 console.log('LEN='+t.length);
 for(const n of ['AFFILIATE_URLS','href=','target="_blank"','fmb-price','odds','price']){
  let p=0,c=0;
  while(true){const i=t.indexOf(n,p);if(i<0)break;c++;const ctx=t.slice(Math.max(0,i-1600),Math.min(t.length,i+n.length+4200));if(/AFFILIATE_URLS|href|bookmaker|odds|price|fmb-/i.test(ctx)){console.log('NEEDLE='+n);console.log('CTX='+ctx.replace(/\n/g,'\\n'));}p=i+n.length;if(c>=20)break;}
 }
}

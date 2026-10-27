// Read-only public frontend refresh-footprint audit. Public static assets only, max 20 script GETs.
// Never print JavaScript contents, cookies, request URLs with queries, or third-party secrets.
const HOME='https://www.ball46.com/';
const root=new URL(HOME);
const ts=new Date().toISOString();
const out={atUtc:ts,readOnly:true,main:null,assets:[],notes:[]};
const get=async uri=>{const r=await fetch(uri,{redirect:'follow',signal:AbortSignal.timeout(20000)});
 const ab=await r.arrayBuffer();return {http:r.status,headers:r.headers,size:ab.byteLength,data:ab.byteLength<2_000_000?Buffer.from(ab).toString('utf8'):''};};
const main=await get(HOME);
out.main={http:main.http,bytes:main.size,cacheControl:main.headers.get('cache-control'),cacheStatus:main.headers.get('cf-cache-status')};
const scriptNames=new Set();
for(const match of main.data.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/ig)){
 try{const uri=new URL(match[1],HOME);if(uri.hostname===root.hostname&&/\.js(?:$|\?)/.test(uri.pathname))scriptNames.add(uri.pathname);}catch{}
}
const findFrequencies=(text)=>[...text.matchAll(/setInterval\s*\([\s\S]{0,280}?,\s*(\d{3,6})\s*\)/g)].slice(0,20).map(m=>Number(m[1]));
const inlineIntervals=findFrequencies(main.data);
out.main.scriptCount=scriptNames.size;out.main.inlineIntervalMs=inlineIntervals.slice(0,20);
for(const path of [...scriptNames].slice(0,20)){
 try{const r=await get(new URL(path,HOME));out.assets.push({path,http:r.http,bytes:r.size,intervalMs:findFrequencies(r.data),
  mentionsEngine:r.data.includes('/api/engine/'),mentionsSignals:r.data.includes('/signals'),mentionsBoard:r.data.includes('/board'),mentionsFetch:/\bfetch\s*\(/.test(r.data)});}
 catch{out.assets.push({path,error:'not_readable'});}
}
console.log('BALL46_PUBLIC_REFRESH_FOOTPRINT='+JSON.stringify(out));

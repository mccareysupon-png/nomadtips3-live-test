import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
const sources=new Set(['/longterm-performance-343.js','/b46-statistics-fast-v1-20261116.js','/singlepage-workspace-343.js']);
export function canonicalSource(path,src){
 const rules=path==='/longterm-performance-343.js'?[
 ["winCredits+=o==='WIN'?1:o==='HALF_WIN'?.5:0","winCredits+=o==='WIN'||o==='HALF_WIN'?1:0"],
 ["rate=s.ratePoints.at(-1)?.value??null","rate=(s.wins+s.losses)>0?s.wins/(s.wins+s.losses)*100:null"]
 ]:path==='/b46-statistics-fast-v1-20261116.js'?[["(head.win+head.halfWin*.5)/wl*100","(head.win+head.halfWin)/wl*100"]]:[
 ["(c.WIN + c.HALF_WIN * .5) / decided * 100","(c.WIN + c.HALF_WIN) / decided * 100"],
 ["(WIN + 0.5 × HALF_WIN) ÷ (WIN + LOSS + HALF_WIN + HALF_LOSS)","(WIN + HALF_WIN) ÷ (WIN + HALF_WIN + LOSS + HALF_LOSS)"]
 ];
 for(const [a,b] of rules){if(!src.includes(a))throw Error('CANONICAL_SOURCE_DRIFT '+path+' '+a);src=src.replaceAll(a,b)}
 return src+'\n/* B46_CANONICAL_WIN_RATE_PROD_V1 */\n';
}

export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);const p=new URL(req.url).pathname;
 if(req.method!=='GET'||!r.ok||!sources.has(p))return r;
 const raw=await r.text();const h=new Headers(r.headers);let src;
 try{src=canonicalSource(p,raw)}catch(e){console.error('CANONICAL_SOURCE_DRIFT',p);return new Response(raw,{status:r.status,statusText:r.statusText,headers:h})}
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');return new Response(src,{status:r.status,statusText:r.statusText,headers:h});
}};

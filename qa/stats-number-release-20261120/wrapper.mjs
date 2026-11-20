import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
const finance='/longterm-performance-343.js';
function replaceExact(s,a,b){if(!s.includes(a))throw Error('FORMAT_SOURCE_DRIFT '+a);return s.replaceAll(a,b)}
export function patchFinance(s){
 const fixed=String.raw`function b46DisplayFixed(v,d){const p=v.toFixed(d).split(".");p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");return p.join(".")}`+'\n';
 s=replaceExact(s,'function valueText(v){',fixed+'function valueText(v){');
 s=replaceExact(s,'\x24{v.toFixed(2)}U','\x24{b46DisplayFixed(v,2)}U');
 s=replaceExact(s,'s.wins+\x27 · \x27+s.pushes+\x27 · \x27+s.losses',"[s.wins,s.pushes,s.losses].map(n=>n.toLocaleString('en-US')).join(' · ')");
 s=replaceExact(s,'s.stake.toFixed(0)+\x27U','b46DisplayFixed(s.stake,0)+\x27U');
 s=replaceExact(s,'s.maxDD.toFixed(2)+\x27U','b46DisplayFixed(s.maxDD,2)+\x27U');
 s=replaceExact(s,"s.rows+' settled'","s.rows.toLocaleString('en-US')+' settled'");
 return s;
}


export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!r.ok||new URL(req.url).pathname!==finance)return r;
 const source=await r.text();let output;
 try{output=patchFinance(source)}catch(e){console.error('B46_FORMAT_DRIFT',e.message);output=source}
 const h=new Headers(r.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new Response(output,{status:r.status,statusText:r.statusText,headers:h});
}};
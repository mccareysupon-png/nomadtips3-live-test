import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const finance='/longterm-performance-343.js',card='/b46-statistics-card-20261116.js',fast='/b46-statistics-fast-v1-20261116.js';
const roiHelper="function b46RoiTone(v){const t=String(v).trim();if(!/^[-+]?\\d+(?:\\.\\d+)?%$/.test(t))return 'neutral';const n=Number(t.slice(0,-1));return n>0?'green':n<0?'red':'yellow'}\n";
function exact(s,a,b){if(!s.includes(a))throw Error('ROI_SOURCE_DRIFT '+a);return s.replaceAll(a,b)}
export function patchRoi(s,path){
 s=exact(s,'function b46RateTone(v){',roiHelper+'function b46RateTone(v){');
 if(path===finance){
  s=exact(s,"s.roi>0?'green':s.roi<0?'red':'white'","b46RoiTone(kpiText(s.roi,'pct'))");
  s=exact(s,"(k==='rate'?' data-b46-rate-tone=\"'+b46RateTone(v)+'\"':'')","(k==='rate'?' data-b46-rate-tone=\"'+b46RateTone(v)+'\"':k==='roi'?' data-b46-roi-tone=\"'+b46RoiTone(v)+'\"':'')");
  s=exact(s,"(v[0]==='WIN RATE'?' data-b46-rate-tone=\"'+b46RateTone(v[1])+'\"':'')","(v[0]==='WIN RATE'?' data-b46-rate-tone=\"'+b46RateTone(v[1])+'\"':v[0]==='ROI'?' data-b46-roi-tone=\"'+b46RoiTone(v[1])+'\"':'')");
 }else if(path===card){
  s=exact(s,"if(entry.key==='rate')value.dataset.b46RateTone=b46RateTone(entry.value);","if(entry.key==='rate')value.dataset.b46RateTone=b46RateTone(entry.value);if(entry.key==='roi')value.dataset.b46RoiTone=b46RoiTone(entry.value);");
 }else if(path===fast){
  s=exact(s,"if(key==='rate')strong.dataset.b46RateTone=b46RateTone(value);","if(key==='rate')strong.dataset.b46RateTone=b46RateTone(value);if(key==='roi')strong.dataset.b46RoiTone=b46RoiTone(value);");
 }
 return s;
}
export const css='<style id="b46-stats-roi-color-20261120">@layer b46RoiPalette{html:root body [data-b46-roi-tone="green"][data-b46-roi-tone]{color:#087c50!important}html:root body [data-b46-roi-tone="red"][data-b46-roi-tone]{color:#b42336!important}html:root body [data-b46-roi-tone="yellow"][data-b46-roi-tone]{color:#946200!important}html:root[data-theme="dark"] body [data-b46-roi-tone="green"][data-b46-roi-tone]{color:#55d6a1!important}html:root[data-theme="dark"] body [data-b46-roi-tone="red"][data-b46-roi-tone]{color:#ff727e!important}html:root[data-theme="dark"] body [data-b46-roi-tone="yellow"][data-b46-roi-tone]{color:#f5ce57!important}}</style>';


export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!r.ok)return r;
 const path=new URL(req.url).pathname;
 const js=[finance,card,fast].includes(path);
 if(!js&&(!pages.has(path)||!r.headers.get('content-type')?.includes('text/html')))return r;
 const h=new Headers(r.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 if(js){const source=await r.text();let output;try{output=patchRoi(source,path)}catch(e){console.error('B46_ROI_DRIFT',e.message);output=source}return new Response(output,{status:r.status,statusText:r.statusText,headers:h})}
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};
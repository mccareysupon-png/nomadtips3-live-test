import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
export const css='<style id="b46-stats-source-label-20261120">@layer b46StatsSourceMask{small.sp-result-source,small.b46-sc-source{display:none!important}}html:root body small.sp-result-source.sp-result-source.sp-result-source,html:root body small.b46-sc-source.b46-sc-source.b46-sc-source{display:none!important}</style>';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!r.ok||!pages.has(new URL(req.url).pathname)||!r.headers.get('content-type')?.includes('text/html'))return r;
 const h=new Headers(r.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};
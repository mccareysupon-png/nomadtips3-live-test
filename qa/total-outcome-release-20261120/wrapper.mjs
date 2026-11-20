import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
export const css='<style id="b46-total-outcome-border-20261120">@layer b46TotalOutcomeBorder{html:root body #b46-finance-chart-card .b46-stage-outcomes-track,html:root body #b46-finance-chart-card .b46-stage-outcomes-track > .b46-stage-outcomes-segment{border-color:transparent!important;outline:none!important;box-shadow:none!important}html:root body #b46-finance-chart-card .b46-stage-outcomes-track{background:transparent!important}}</style>';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!r.ok||!pages.has(new URL(req.url).pathname)||!r.headers.get('content-type')?.includes('text/html'))return r;
 const h=new Headers(r.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};
import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import {patchHtml,patchDashboard} from './b46-ui-batch-patch-20261120.mjs';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const dashboard='/dashboard-v2-stage3-featured-facts-20261013a.js';
export default {...original,async fetch(req,env,ctx){
 const res=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!res.ok)return res;
 const path=new URL(req.url).pathname,html=pages.has(path)&&res.headers.get('content-type')?.includes('text/html');
 if(!html&&path!==dashboard)return res;
 const source=await res.text();let result;
 try{result=html?patchHtml(source):patchDashboard(source)}catch(e){
  console.error('B46_UI_PATCH_DRIFT',String(e.message));result=source;
 }
 const h=new Headers(res.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 h.set('cache-control','no-store');
 return new Response(result,{status:res.status,statusText:res.statusText,headers:h});
}};
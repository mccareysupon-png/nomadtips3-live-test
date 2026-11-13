import original from './index.js';
export * from './index.js';
import text from './statistics-read-v2-payload.txt';
const patch=JSON.parse(text);
export default {...original,async fetch(request,env,ctx){
 const u=new URL(request.url);
 if(request.method==='GET'&&['/api/statistics/summary','/api/statistics/history'].includes(u.pathname)){u.pathname=u.pathname.replace('/api/statistics','');return env.B46_STATISTICS_READ_V2.fetch(new Request(u,request))}
 if(['GET','HEAD'].includes(request.method)){const f=patch.files.find(x=>x.path===u.pathname);if(f)return new Response(request.method==='HEAD'?null:f.body,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache'}})}
 const r=await original.fetch(request,env,ctx);if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||r.status!==200||!r.headers.get('content-type')?.includes('text/html'))return r;
 let html=await r.text();if(html.split(patch.htmlDelta.before).length!==2)return new Response('Statistics release baseline mismatch',{status:503,headers:{'cache-control':'no-store'}});html=html.replace(patch.htmlDelta.before,()=>patch.htmlDelta.after);
 for(const f of patch.files){const escaped=f.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');html=html.replace(new RegExp('(["\'])('+escaped+')([^"\']*)(["\'])','g'),(_,a,path,q,z)=>a+path+q+(q.includes('?')?'&':'?')+'b46_stats='+f.sha.slice(0,12)+z);}
 const headers=new Headers(r.headers);for(const name of['content-length','content-encoding','etag'])headers.delete(name);headers.set('cache-control','no-store');return new Response(html,{status:r.status,headers});
}};

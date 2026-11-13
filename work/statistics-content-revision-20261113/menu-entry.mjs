import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import text from './statistics-menu-payload-20261114.txt';
const patch=JSON.parse(text);
export default {...original,async fetch(request,env,ctx){
 const u=new URL(request.url);
 if(['GET','HEAD'].includes(request.method)&&u.pathname===patch.path)return new Response(request.method==='HEAD'?null:patch.body,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache'}});
 const r=await original.fetch(request,env,ctx);
 if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||r.status!==200||!r.headers.get('content-type')?.includes('text/html'))return r;
 const html=(await r.text()).replace(/(["'])(\/?ui-sync-fixes-343-v2\.js)([^"']*)(["'])/g,(_,a,path,q,z)=>a+path+q+(q.includes('?')?'&':'?')+'b46_menu='+patch.sha.slice(0,12)+z);
 const headers=new Headers(r.headers);for(const name of['content-length','content-encoding','etag'])headers.delete(name);headers.set('cache-control','no-store');
 return new Response(html,{status:r.status,headers});
}};

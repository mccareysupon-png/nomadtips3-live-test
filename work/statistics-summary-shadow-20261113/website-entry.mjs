import original from './index.js';
export * from './index.js';
import text from './summary-release-payload.txt';
const patch=JSON.parse(text),TAG='summary-pc-banners-20261113';
export default {...original,async fetch(request,env,ctx){
 const u=new URL(request.url);
 if(['GET','HEAD'].includes(request.method)){
  if(u.pathname==='/api/statistics/summary'||patch.mediaPaths.includes(u.pathname)){
   const target=new URL(u);if(u.pathname==='/api/statistics/summary')target.pathname='/summary';
   return env.STATISTICS_SUMMARY.fetch(new Request(target,request));
  }
  const file=patch.files.find(x=>x.path===u.pathname);
  if(file)return new Response(request.method==='HEAD'?null:file.body,{headers:{'content-type':file.type,'cache-control':'no-cache','x-content-type-options':'nosniff'}});
 }
 const response=await original.fetch(request,env,ctx);
 if(!['/','/index.html'].includes(u.pathname)||request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 let html=await response.text();
 if(!html.includes(patch.htmlDelta.before)||html.split(patch.htmlDelta.before).length!==2)return new Response('Release HTML does not match verified baseline',{status:503,headers:{'cache-control':'no-store'}});
 html=html.replace(patch.htmlDelta.before,()=>patch.htmlDelta.after);
 for(const f of patch.files){const re=new RegExp('(["\\\'])('+f.path.replaceAll('.','\\.')+')([^"\\\']*)(["\\\'])','g');html=html.replace(re,(_,a,path,q,z)=>a+path+q+(q.includes('?')?'&':'?')+'b46='+TAG+z);}
 html=html.replace('</head>',patch.head+'</head>');
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');headers.set('cache-control','no-store');
 return new Response(html,{status:response.status,headers});
}};

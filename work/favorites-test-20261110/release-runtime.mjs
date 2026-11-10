const types={controller:'application/javascript; charset=utf-8',dashboard:'application/javascript; charset=utf-8',workspace:'application/javascript; charset=utf-8',style:'text/css; charset=utf-8'};
export function patchFavoritesHTML(html,payload){
 if(html.includes('b46-favorites-20261110.js?'))return html;
 let dashboard=0,workspace=0;
 html=html.replace(/(<script\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>[\s\S]*?<\/script>)/gi,(full,before,src,after)=>{
  const u=new URL(src.replaceAll('&amp;','&'),'https://ball46.com');
  if(u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js'){dashboard++;return'<script src="'+payload.assets.controller.url+'" defer></script>'+before+payload.assets.dashboard.url+after}
  if(u.pathname==='/singlepage-workspace-343.js'){workspace++;return before+payload.assets.workspace.url+after}return full;
 });
 if(dashboard!==1||workspace!==1||html.split(payload.nativeBefore).length!==2)throw Error('FAVORITES_CURRENT_HTML_SOURCE_DRIFT');
 html=html.replace(payload.nativeBefore,()=>payload.nativeAfter);
 if(html.split('</head>').length!==2)throw Error('FAVORITES_HEAD_DRIFT');
 return html.replace('</head>','<link rel="stylesheet" href="'+payload.assets.style.url+'"></head>');
}
export function wrapFavorites(previous,payload){
 const files=new Map(Object.entries(payload.assets).map(([key,f])=>[f.url,{...f,type:types[key]}])),decoded=new Map();
 return{...previous,async fetch(request,env,ctx){const u=new URL(request.url),file=files.get(u.pathname+u.search);
  if(file&&['GET','HEAD'].includes(request.method)){if(!decoded.has(file.url))decoded.set(file.url,Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)));return new Response(request.method==='HEAD'?null:decoded.get(file.url),{headers:{'content-type':file.type,'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','x-ball46-favorites':'20261110'}})}
  const response=await previous.fetch(request,env,ctx);if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||response.status!==200||!(response.headers.get('content-type')||'').includes('text/html'))return response;
  const html=patchFavoritesHTML(await response.text(),payload),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
 }};
}
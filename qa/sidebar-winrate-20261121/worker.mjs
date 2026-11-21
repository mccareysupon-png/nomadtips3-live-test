import {sidebarHydratorScript} from './sidebar-hydrator.mjs';
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('READ_ONLY',{status:405});
 if(u.pathname==='/__sidebar_health')return Response.json({ok:true,scope:'TEST_ONLY',revision:'SIDEBAR_WINRATE_BOOTSTRAP_20261121_V1',scriptSize:sidebarHydratorScript.length,sessionCache:true,initialReceiverGetLimit:1});
 if(/^\/(?:admin|internal)(?:\/|$)/i.test(u.pathname))return new Response('Forbidden',{status:403});
 const hdr=new Headers();for(const key of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const x=request.headers.get(key);if(x)hdr.set(key,x)}
 const origin=new URL(u.pathname+u.search,'https://ball46.com');
 const response=await env.B46_PRODUCTION_READ.fetch(new Request(origin,{method:request.method,headers:hdr,redirect:'manual'}));
 const headers=new Headers(response.headers);headers.delete('set-cookie');headers.set('x-robots-tag','noindex,nofollow');
 const location=headers.get('location');
 if(location){try{const dest=new URL(location,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(dest.hostname))headers.set('location',new URL(dest.pathname+dest.search+dest.hash,request.url).toString())}catch{}}
 if(request.method!=='GET'||!response.ok||!['/','/index','/index.html'].includes(u.pathname)||!headers.get('content-type')?.includes('text/html'))return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
 for(const k of ['content-length','content-encoding','etag','last-modified'])headers.delete(k);
 headers.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.prepend('<script id="b46-sidebar-hydrator-test">'+sidebarHydratorScript+'</script>',{html:true})}}).transform(new Response(response.body,{status:response.status,headers}));
}};

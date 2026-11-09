// Public content-addressed JS/CSS only. No cache storage, timers or provider calls.
const PARAM='b46_static';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export function rewriteStaticLinks(html,manifest){
  const allowed=new Map(manifest.map(f=>[f.path,f.sha]));
  return html.replace(/<(?:script|link)\b[^>]*>/gi,tag=>tag.replace(/(\s)(src|href)=(["'])([^"']+)\3/gi,(attr,space,name,quote,raw)=>{
    let u;try{u=new URL(raw.replaceAll('&amp;','&'),'https://ball46.com')}catch{return attr}
    if(!['ball46.com','www.ball46.com'].includes(u.hostname)||u.searchParams.has(PARAM))return attr;
    const hash=allowed.get(u.pathname+u.search);
    return hash?space+name+'='+quote+raw+(raw.includes('?')?'&':'?')+PARAM+'='+hash+quote:attr;
  }));
}
export function wrapStaticAssets(previous,manifest){
  const allowed=new Map(manifest.map(f=>[f.path,f.sha]));
  return {...previous,async fetch(request,env,ctx){
    const u=new URL(request.url),values=u.searchParams.getAll(PARAM),wanted=values[0];
    // Strip only our key for exact legacy-route lookup; preserve original query spelling.
    const cleanPath=(u.pathname+u.search).replace(new RegExp('([?&])'+PARAM+'=[^&]*(&?)'),(_,lead,tail)=>tail?lead:'').replace(/[?&]$/,'');
    const addressed=request.method==='GET'&&values.length===1&&allowed.get(cleanPath)===wanted;
    const delegated=addressed?new Request(new URL(cleanPath,u.origin),request):request;
    const response=await previous.fetch(delegated,env,ctx);
    if(addressed&&response.status===200&&!request.headers.has('authorization')&&!response.headers.has('set-cookie')&&!/\bprivate\b/i.test(response.headers.get('cache-control')||'')&&!/(?:^|,)\s*(?:\*|cookie|authorization)\s*(?:,|$)/i.test(response.headers.get('vary')||'')&&/^(?:text\/css|(?:application|text)\/javascript)(?:;|$)/i.test(response.headers.get('content-type')||'')&&!response.headers.has('content-encoding')){
      const bytes=await response.arrayBuffer(),headers=new Headers(response.headers);
      if(await digest(bytes)===wanted){headers.set('cache-control','public, max-age=31536000, immutable');headers.delete('pragma');headers.delete('expires');headers.set('x-ball46-static-cache','content-sha256');}
      else headers.set('cache-control','no-store');
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
    }
    if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||response.status!==200||!(response.headers.get('content-type')||'').includes('text/html'))return response;
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
    return new Response(rewriteStaticLinks(await response.text(),manifest),{status:response.status,statusText:response.statusText,headers});
  }};
}
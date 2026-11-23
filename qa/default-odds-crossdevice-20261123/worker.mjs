import {crossDeviceOddsStyles,crossDeviceOddsScript} from './crossdevice.mjs';
const TAG='b46-cross-device-odds-v3-test';
const injection='<style id="'+TAG+'-css">'+crossDeviceOddsStyles+'</style><script id="'+TAG+'-js">'+crossDeviceOddsScript+'</script>';
const pages=new Set(['/','/index','/index.html']);
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('READ_ONLY_TEST',{status:405});
 if(u.pathname==='/__crossdevice_health')return Response.json({scope:'ISOLATED_TEST_ONLY',feature:'DEFAULT_ODDS_V3_CROSS_DEVICE',styles:crossDeviceOddsStyles,script:crossDeviceOddsScript,noApiCallsAdded:true},{headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 const target=new URL(u.pathname+u.search,'https://ball46.com');
 const headers=new Headers();for(const h of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(h);if(v)headers.set(h,v)}
 const source=await env.B46_PRODUCTION_READ.fetch(new Request(target,{method:req.method,headers,redirect:'manual'}));
 const out=new Headers(source.headers);out.delete('set-cookie');out.set('x-robots-tag','noindex,nofollow');
 if(req.method==='GET'&&source.ok&&pages.has(u.pathname)&&out.get('content-type')?.includes('text/html')){
  for(const h of ['content-length','content-encoding','etag','last-modified'])out.delete(h);
  out.set('cache-control','no-store');out.set('x-b46-release-scope','DEFAULT_ODDS_CROSS_DEVICE_TEST_ONLY');
  return new HTMLRewriter().on('head',{element(e){e.append(injection,{html:true})}}).transform(new Response(source.body,{status:source.status,statusText:source.statusText,headers:out}));
 }
 const location=out.get('location');if(location){const next=new URL(location,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(next.hostname))out.set('location',new URL(next.pathname+next.search+next.hash,req.url).toString())}
 return new Response(req.method==='HEAD'?null:source.body,{status:source.status,statusText:source.statusText,headers:out});
}};
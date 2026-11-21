import {fullMarketOddsStyles,fullMarketOddsScript} from './fullmarket-odds-v3.mjs';
const SCRIPT='ball46-fullmarket-odds-v3-test-20261121';
const INJECT='<style id="b46-fullmarket-odds-v3-style-test">'+fullMarketOddsStyles+'</style><script id="b46-fullmarket-odds-v3-script-test">'+fullMarketOddsScript+'</script>';
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return new Response('READ_ONLY_TEST',{status:405,headers:{'cache-control':'no-store'}});
 if(u.pathname==='/__fullmarket_health')return Response.json({ok:true,scope:'ISOLATED_TEST_ONLY',feature:'FULLMARKET_ODDS_V3',name:SCRIPT,sourceRequestsAdded:0,defaultOddsUnchanged:true,styles:fullMarketOddsStyles,script:fullMarketOddsScript},{headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 if(/^\/(admin|internal)(\/|$)/i.test(u.pathname))return new Response('Forbidden',{status:403});
 const headers=new Headers();
 for(const h of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(h);if(v)headers.set(h,v)}
 const originUrl=new URL(u.pathname+u.search,'https://ball46.com');
 const source=await env.B46_PRODUCTION_READ.fetch(new Request(originUrl,{method:req.method,headers,redirect:'manual'}));
 const out=new Headers(source.headers);
 out.delete('set-cookie');out.set('x-robots-tag','noindex,nofollow');
 const redir=out.get('location');
 if(redir){const next=new URL(redir,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(next.hostname))out.set('location',new URL(next.pathname+next.search+next.hash,req.url).toString())}
 if(req.method!=='GET'||!source.ok||!['/','/index.html','/index'].includes(u.pathname)||!out.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:source.body,{status:source.status,statusText:source.statusText,headers:out});
 for(const h of ['content-length','content-encoding','etag','last-modified'])out.delete(h);
 out.set('cache-control','no-store');
 out.set('x-b46-release-scope','FULLMARKET_V3_TEST_ONLY');
 return new HTMLRewriter().on('head',{element(e){e.append(INJECT,{html:true})}}).transform(new Response(source.body,{status:source.status,statusText:source.statusText,headers:out}));
}};
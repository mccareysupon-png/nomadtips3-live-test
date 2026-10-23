import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FAVICON_192_PNG_BASE64} from './icon.mjs';
export const BASE_ID='917557b5-5622-4ac6-b2a3-fcee9779dddb';
export const BASE_MAIN_SHA='5f81f2bf53edca09588718aadd48e0e1e8963357e32e184d0662bb2a6cae5917';
export const BASE_HTML_SHA='159d5c4f147eec77a320268b3b82a02c6cb29edf0fccf953d7d6599a4f3cca23';
export const NEW_ICON_SHA='dfd187357c6b321a05890922c4b3590abcc62cda68803e13cb0f5d787ea5eb8c';
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function patchHtml(html){
 if(typeof html!=='string')throw Error('HTML_NOT_STRING');
 const end=html.indexOf('</head>');if(end<0)return html;
 let h=html.slice(0,end);if(!h.includes('<!-- BALL46 SEO START -->'))return html;
 const oldTitle='BALL46 | Live Football Scores, Signals &amp; Tips';
 const title='BALL46 | Live Betting Tips, Football Scores &amp; Signals';
 const oldDesc='Follow live football scores, match signals, football tips and real-time statistics. Explore event flow and transparent signal results with BALL46.';
 const desc='Live betting tips, live football scores, real-time odds, match signals and statistics. Follow live matches and transparent signal results on BALL46.';
 if(!h.includes(oldTitle)||!h.includes(oldDesc))return html;
 h=h.replaceAll(oldTitle,title).replaceAll(oldDesc,desc)
    .replaceAll('<meta property="og:site_name" content="Ball46">','<meta property="og:site_name" content="BALL46">')
    .replaceAll('"name":"Ball46"','"name":"BALL46"');
 if(!h.includes('Live Betting Tips'))throw Error('SEO_TRANSFORM_FAILED');
 return h+html.slice(end);
}
const before='export default {';
const after='const __b46BeforeFaviconSeo20261023 = {';
export function patchMain(source){
 assert.equal(sha(Buffer.from(source)),BASE_MAIN_SHA,'ACTIVE_SOURCE_DRIFT');
 assert.equal(source.split(before).length,2,'EXPORT_ANCHOR_DRIFT');
 assert.equal(sha(Buffer.from(FAVICON_192_PNG_BASE64,'base64')),NEW_ICON_SHA,'ICON_BYTES_DRIFT');
 const cloudflareHook=`
const __b46SeoFaviconPatch20261023 = ${patchHtml.toString()};
const __b46Fav192B6420261023 = ${JSON.stringify(FAVICON_192_PNG_BASE64)};
export default {...__b46BeforeFaviconSeo20261023,async fetch(request,env,ctx){
 const url=new URL(request.url),method=request.method,path=url.pathname;
 if((method==='GET'||method==='HEAD')&&path==='/favicon-192.png'){
  const pixels=Uint8Array.from(atob(__b46Fav192B6420261023),c=>c.charCodeAt(0));
  return new Response(method==='HEAD'?null:pixels,{status:200,headers:{'content-type':'image/png','cache-control':'public, max-age=3600','x-ball46-favicon-version':'owner-20261023'}});
 }
 const response=await __b46BeforeFaviconSeo20261023.fetch.call(__b46BeforeFaviconSeo20261023,request,env,ctx);
 if(method!=='GET'||(path!=='/'&&path!=='/index.html')||response.status!==200||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
 const input=await response.text(),output=__b46SeoFaviconPatch20261023(input);
 if(output===input)return new Response(input,response);
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
 return new Response(output,{status:response.status,statusText:response.statusText,headers});
}};
`;
 const candidate=source.replace(before,after)+cloudflareHook;
 assert(!candidate.includes('export default {'));
 assert(candidate.includes('x-ball46-favicon-version'));
 return candidate;
}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const BASE='018533eb-c7ed-4456-8aa6-9c652fdad15b', MARK='B46_HIDE_MEMBER_COUNT_20261029', MAIN_SHA='a8bb15ba1ef0febcb434ee1ce091db6547a397b9231cea59363c96617230d395';
export function concealMemberCount(html){
 const pattern=/<span\b(?=[^>]*\bclass=["'][^"']*\bb46-premium-members\b[^"']*["'])[^>]*>\s*<span\b[^>]*>\s*<strong\b[^>]*>\s*1,011\s*<\/strong>\s*<\/span>\s*<\/span>/g;
 const matches=Array.from(html.matchAll(pattern));assert.equal(matches.length,1,'MEMBER_COUNT_SOURCE_DRIFT');
 const removed=matches[0][0],offset=matches[0].index;
 return html.slice(0,offset)+html.slice(offset+removed.length);
}
export function patchMain(source){
 assert.equal(sha(source),MAIN_SHA,'MAIN_SOURCE_DRIFT');
 const marker='export default{...__statisticsHeroPrevious';assert.equal(source.split(marker).length,2,'EXPORT_DRIFT');
 return source.replace(marker,'const __memberCountPrevious={...__statisticsHeroPrevious')+
 '\n'+concealMemberCount.toString().replace("assert.equal(matches.length,1,'MEMBER_COUNT_SOURCE_DRIFT');","if(matches.length!==1)throw Error('MEMBER_COUNT_SOURCE_DRIFT');")+
 '\nexport default{...__memberCountPrevious,async fetch(request,env,ctx){const r=await __memberCountPrevious.fetch.call(__memberCountPrevious,request,env,ctx);if(request.method!=="GET"||!["/","/index.html"].includes(new URL(request.url).pathname)||!r.ok||!(r.headers.get("content-type")||"").includes("text/html"))return r;const html=concealMemberCount(await r.text());const headers=new Headers(r.headers);headers.delete("content-length");headers.delete("etag");headers.set("cache-control","no-cache, must-revalidate");return new Response(html,{status:r.status,statusText:r.statusText,headers});}};\n';
}

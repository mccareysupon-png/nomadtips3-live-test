import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BASE_ID='14b3a181-41e0-471b-87cd-10b700c0bca5';
export const BASE_MAIN_SHA='cc70897a889f3a5a79b1853c8417d71bc9fc5ad587c2ca5dc5e19aeddc0f3ee0';
export const BASE_HTML_SHA='42133925b3d06c92be845434746ae3b1f763653bd9d1e9b1fd07b8400357bdd9';
export const BASE_ICON_SHA='dfd187357c6b321a05890922c4b3590abcc62cda68803e13cb0f5d787ea5eb8c';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const OLD='@media(prefers-reduced-motion:reduce){#b46-data-orbit-loading .b46-orbit-ring::before{animation:none;transform:rotate(110deg)}}';
const FIX='@media(prefers-reduced-motion:reduce){#b46-data-orbit-loading .b46-orbit-ring::before{animation:b46-orbit-rotate-20261019 6s linear infinite;transform-origin:50% 50%}}';
export function patchHtml(html){
 if(typeof html!=='string')throw Error('INPUT_NOT_HTML');
 if(html.split(OLD).length!==2)throw Error('LOADING_OLD_RULE_MISSING_OR_DUPLICATED');
 if(!html.includes('<style id="b46-global-data-orbit-style-20261019">'))throw Error('LOADING_STYLE_MISSING');
 if(!html.includes('@keyframes b46-orbit-rotate-20261019{to{transform:rotate(360deg)}}'))throw Error('SPIN_KEYFRAMES_MISSING');
 const out=html.replace(OLD,FIX);
 assert(out.includes(FIX));
 if(out.slice(out.indexOf('</head>'))!==html.slice(html.indexOf('</head>')))throw Error('BODY_MUST_BE_BYTE_IDENTICAL');
 if(out.includes(OLD))throw Error('REDUCED_MOTION_STATIC_RULE_REMAINED');
 return out;
}
export function patchMain(source){
 assert.equal(sha(Buffer.from(source)),BASE_MAIN_SHA,'ACTIVE_WORKER_SOURCE_DRIFT');
 const anchor='export default {',before='const __b46BeforeRingFix20261023 = {';
 assert.equal(source.split(anchor).length,2,'WORKER_EXPORT_COUNT_DRIFT');
 const helper=`
const __b46PatchRing20261023 = ${patchHtml.toString()};
export default {...__b46BeforeRingFix20261023, async fetch(request,env,ctx){
 const response=await __b46BeforeRingFix20261023.fetch.call(__b46BeforeRingFix20261023,request,env,ctx);
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||!['/','/index.html'].includes(path)||response.status!==200||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
 const input=await response.text();
 const output=__b46PatchRing20261023(input);
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
 return new Response(output,{status:response.status,statusText:response.statusText,headers});
}};
`;
 // patchHtml uses module-scope OLD/FIX only in development: embedded wrapper needs literals:
 const embedded=helper.replace(`${patchHtml.toString()}`,patchHtml.toString()
    .replaceAll(/\bOLD\b/g,JSON.stringify(OLD)).replaceAll(/\bFIX\b/g,JSON.stringify(FIX)));
 const out=source.replace(anchor,before)+embedded;
 assert.equal(out.split('export default {').length,2);
 assert(out.includes('__b46BeforeRingFix20261023'));
 return out;
}

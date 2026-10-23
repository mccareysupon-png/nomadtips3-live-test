import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BASE_VERSION='d48d306b-d6ac-45e2-ac5f-1a7f0bc7aee3';
export const BASE_MAIN_SHA='a3de3b7c6f990edf0d2dc58d076b62f948b61990780f0c594205a42a707d3bdc';
export const BASE_HTML_SHA='01d97e98ec0c768411d07b9d520a9d48da4758ffa2498d9e6e849822f655a2f8';
export const BASE_JS_SHA='cf602f84529dfd0963c9d060c18c1e7b2c92c258bc0ea8e2adf62b0ccaccdb6d';
export const JS_ROUTE='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const OLD_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018" defer>';
export const NEW_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018-b46-atomic-v11-20261023" defer>';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const partsOld="const parts=[...tpl.content.children];parts.forEach((node,i)=>{node.dataset.b46FeatureSignalKey=key;node.dataset.b46FeatureSignalPart=String(i)});if(parts[0])parts[0].dataset.b46SignalHtml=html;return parts}";
const partsNew="const parts=[...tpl.content.children];const metrics=parts[1],timeline=parts[2];if(parts[0]?.classList.contains('feature-signal-main')&&metrics?.classList.contains('feature-signal-meta')&&timeline?.classList.contains('feature-signal-meta')){metrics.dataset.v11Kind='metrics';timeline.dataset.v11Kind='timeline';[...metrics.children].filter(n=>n.tagName==='SPAN').forEach((field,i)=>{const raw=String(field.textContent||'').replace(/\\s+/g,' ').trim();const label=['LINE','ODDS','BOOKMAKER'][i]||'';const value=i===0?raw.replace(/^line\\s*/i,''):i===1?raw.replace(/^odds\\s*/i,''):raw;field.dataset.v11Label=label;field.dataset.v11Value=value||'—'})}parts.forEach((node,i)=>{node.dataset.b46FeatureSignalKey=key;node.dataset.b46FeatureSignalPart=String(i)});if(parts[0])parts[0].dataset.b46SignalHtml=html;return parts}";
const hostOld="function patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];";
const hostNew="function patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];host.dataset.v11Count=String(rows.length);";
export function patchJs(js){
 assert.equal(sha(Buffer.from(js)),BASE_JS_SHA,'LIVE_JS_CHANGED_ABORT');
 assert.equal(js.split(partsOld).length,2,'PARTS_ANCHOR_DRIFT');
 assert.equal(js.split(hostOld).length,2,'HOST_ANCHOR_DRIFT');
 const patched=js.replace(partsOld,partsNew).replace(hostOld,hostNew);
 assert.equal(patched.replace(partsNew,partsOld).replace(hostNew,hostOld),js,'UNEXPECTED_JS_CHANGE');
 assert(patched.includes("metrics.dataset.v11Kind='metrics'")&&patched.includes('host.dataset.v11Count=String(rows.length)'));
 return patched;
}
export function patchHtml(html){
 assert.equal(sha(Buffer.from(html)),BASE_HTML_SHA,'LIVE_HTML_CHANGED_ABORT');
 assert.equal(html.split(OLD_TAG).length,2,'SCRIPT_TAG_DRIFT');
 const patched=html.replace(OLD_TAG,NEW_TAG);
 assert.equal(patched.replace(NEW_TAG,OLD_TAG),html,'UNEXPECTED_HTML_CHANGE');
 return patched;
}
export function patchMain(source,expectedJs,expectedHtml){
 assert.equal(sha(Buffer.from(source)),BASE_MAIN_SHA,'ACTIVE_WORKER_SOURCE_CHANGED_ABORT');
 const anchor='export default {',before='const __b46BeforeAtomicSignal20261023 = {';
 assert.equal(source.split(anchor).length,2,'MAIN_EXPORT_DRIFT');
 const snippet=String.raw`
const __b46OriginalSignalJsHash = '__BASE_JS_SHA__';
const __b46OldTag = '__OLD_TAG__';
const __b46NewTag = '__NEW_TAG__';
const __b46JsOld1 = __PARTS_OLD__;
const __b46JsNew1 = __PARTS_NEW__;
const __b46JsOld2 = __HOST_OLD__;
const __b46JsNew2 = __HOST_NEW__;
export default {...__b46BeforeAtomicSignal20261023, async fetch(request,env,ctx){
 const path=new URL(request.url).pathname,method=request.method;
 const response=await __b46BeforeAtomicSignal20261023.fetch.call(__b46BeforeAtomicSignal20261023,request,env,ctx);
 if(method!=='GET'||response.status!==200)return response;
 const isJs=path==='/dashboard-v2-stage3-featured-facts-20261013a.js';
 const isHtml=path==='/'||path==='/index.html';
 if(!isJs&&!isHtml)return response;
 const type=String(response.headers.get('content-type')||'').toLowerCase();
 if(isJs&&!/javascript|text\/plain/.test(type))throw Error('SIGNAL_JS_CONTENT_TYPE_DRIFT');
 if(isHtml&&!type.includes('text/html'))throw Error('SIGNAL_HTML_CONTENT_TYPE_DRIFT');
 const body=await response.text(),headers=new Headers(response.headers);
 let patched=body;
 if(isJs){
  if(body.split(__b46JsOld1).length!==2||body.split(__b46JsOld2).length!==2)throw Error('SIGNAL_JS_ANCHOR_DRIFT');
  patched=body.replace(__b46JsOld1,__b46JsNew1).replace(__b46JsOld2,__b46JsNew2);
  headers.set('cache-control','no-cache, must-revalidate');
  headers.set('x-ball46-signal-ui','atomic-v11-20261023');
 } else {
  if(body.split(__b46OldTag).length!==2)throw Error('SIGNAL_HTML_SCRIPT_TAG_DRIFT');
  patched=body.replace(__b46OldTag,__b46NewTag);
 }
 headers.delete('content-length');headers.delete('etag');
 return new Response(patched,{status:response.status,statusText:response.statusText,headers});
}};
`;
 const inject=snippet.replace('__PARTS_OLD__',JSON.stringify(partsOld)).replace('__PARTS_NEW__',JSON.stringify(partsNew)).replace('__HOST_OLD__',JSON.stringify(hostOld)).replace('__HOST_NEW__',JSON.stringify(hostNew)).replace("'__OLD_TAG__'",JSON.stringify(OLD_TAG)).replace("'__NEW_TAG__'",JSON.stringify(NEW_TAG)).replace('__BASE_JS_SHA__',BASE_JS_SHA);
 const candidate=source.replace(anchor,before)+'\n'+inject;
 assert.equal(candidate.split('export default {').length,2,'WRAPPED_EXPORT_COUNT');
 assert(candidate.includes('__b46BeforeAtomicSignal20261023'),'WRAPPER_MISSING');
 return candidate;
}

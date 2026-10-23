import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const BASE='e0835238-ea2d-47e4-ad21-1fd1cf0884ff';
export const MAIN_SHA='1ebea50045dff9553b59ba7c07c809e50f6bf864a743654ce66acc972acfb808';
export const HTML_SHA='359b3e59929b9d18bdf5f90c39f30c939d9656dbd2e9935802de17fd6c3811ae';
export const JS_SHA='457fbabd07d04b75831147774b3afcccb4c91873892d670a2e15143262f4d89b';
export const JS_PATH='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const OLD_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018-b46-atomic-v11-20261023" defer>';
export const NEW_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018-b46-atomic-v11-20261023-no-empty-ghost" defer>';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const OLD_CLEAR="if(signal){signal.innerHTML='No active signal';signal.classList.remove('locked');signal.title=''}";
const NEW_CLEAR="if(signal){signal.replaceChildren();signal.classList.remove('locked');signal.title=''}";
const OLD_HOST="function patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];host.dataset.v11Count=String(rows.length);";
const NEW_HOST="function patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];if(rows.length){for(const node of [...host.childNodes]){if(node.nodeType===3&&node.textContent.trim().toLowerCase()==='no active signal')node.remove()}}host.dataset.v11Count=String(rows.length);";
export function patchJS(code){
 assert.equal(sha(Buffer.from(code)),JS_SHA,'JS_VERSION_DRIFT');
 assert.equal(code.split(OLD_CLEAR).length,2,'FEATURE_CLEAR_ANCHOR_DRIFT');
 assert.equal(code.split(OLD_HOST).length,2,'FEATURE_SIGNAL_HOST_ANCHOR_DRIFT');
 const next=code.replace(OLD_CLEAR,NEW_CLEAR).replace(OLD_HOST,NEW_HOST);
 assert.equal(next.replace(NEW_CLEAR,OLD_CLEAR).replace(NEW_HOST,OLD_HOST),code,'UNEXPECTED_JS_CHANGE');
 return next;
}
export function patchHTML(html){
 assert.equal(sha(Buffer.from(html)),HTML_SHA,'HTML_VERSION_DRIFT');
 assert.equal(html.split(OLD_TAG).length,2,'SCRIPT_TAG_ANCHOR_DRIFT');
 const next=html.replace(OLD_TAG,NEW_TAG);
 assert.equal(next.replace(NEW_TAG,OLD_TAG),html);
 return next;
}
export function patchWorker(code){
 assert.equal(sha(Buffer.from(code)),MAIN_SHA,'WORKER_MAIN_DRIFT');
 assert.equal(code.split('export default {').length,2,'WORKER_EXPORT_DRIFT');
 const helper=String.raw`
const __b46GhostOldClear=__OLD_CLEAR__;
const __b46GhostNewClear=__NEW_CLEAR__;
const __b46GhostOldHost=__OLD_HOST__;
const __b46GhostNewHost=__NEW_HOST__;
const __b46GhostOldTag=__OLD_TAG__;
const __b46GhostNewTag=__NEW_TAG__;
export default {...__b46BeforeGhost20261023,async fetch(request,env,ctx){
 const resp=await __b46BeforeGhost20261023.fetch.call(__b46BeforeGhost20261023,request,env,ctx);
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||resp.status!==200||!['/','/index.html','/dashboard-v2-stage3-featured-facts-20261013a.js'].includes(path))return resp;
 const isJS=path==='/dashboard-v2-stage3-featured-facts-20261013a.js';
 const type=String(resp.headers.get('content-type')||'').toLowerCase();
 if(isJS&&!/javascript/.test(type))throw Error('GHOST_JS_CONTENT_TYPE_DRIFT');
 if(!isJS&&!type.includes('text/html'))throw Error('GHOST_HTML_CONTENT_TYPE_DRIFT');
 const src=await resp.text(),headers=new Headers(resp.headers);
 let output=src;
 if(isJS){
  if(src.split(__b46GhostOldClear).length!==2||src.split(__b46GhostOldHost).length!==2)throw Error('GHOST_JS_ANCHOR_DRIFT');
  output=src.replace(__b46GhostOldClear,__b46GhostNewClear).replace(__b46GhostOldHost,__b46GhostNewHost);
  headers.set('cache-control','no-cache, must-revalidate');headers.set('x-ball46-empty-ghost','fixed-20261023');
 }else{
  if(src.split(__b46GhostOldTag).length!==2)throw Error('GHOST_HTML_ANCHOR_DRIFT');
  output=src.replace(__b46GhostOldTag,__b46GhostNewTag);
 }
 headers.delete('content-length');headers.delete('etag');
 return new Response(output,{status:resp.status,statusText:resp.statusText,headers});
}};
`;
 const transformed=helper.replace('__OLD_CLEAR__',JSON.stringify(OLD_CLEAR)).replace('__NEW_CLEAR__',JSON.stringify(NEW_CLEAR))
 .replace('__OLD_HOST__',JSON.stringify(OLD_HOST)).replace('__NEW_HOST__',JSON.stringify(NEW_HOST))
 .replace('__OLD_TAG__',JSON.stringify(OLD_TAG)).replace('__NEW_TAG__',JSON.stringify(NEW_TAG));
 const out=code.replace('export default {','const __b46BeforeGhost20261023 = {')+'\n'+transformed;
 assert.equal(out.split('export default {').length,2,'WRAPPED_EXPORT_MISSING');
 return out;
}

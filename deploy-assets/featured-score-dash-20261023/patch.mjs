import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const BASE='50f65def-f4a1-4172-8dd4-ac3c7bb82209';
export const MAIN_SHA='08098fd81c36c997f5b5802229fb438c13fa57f5ba53de0b177e2c00c7fc4918';
export const HTML_SHA='8b1eb262c971a9fc595ddf059ea3ee540724d62e72950bcb7b5a4fae323d5814';
export const JS_SHA='2c7d96adcf18afffa874237a776999d67e141d0fc1e30cb37ffd90691c7993d5';
export const JS_PATH='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const OLD_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018-b46-atomic-v11-20261023-no-empty-ghost" defer>';
export const NEW_TAG='<script src="dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018-b46-atomic-v11-20261023-no-empty-ghost-score-short" defer>';
export const OLD_SCORE="function scoreLabel(f){if(classify(f)==='scheduled')return'—';const p=scorePair(f);return p.home===null||p.away===null?'—':\`\${show(p.home)}–\${show(p.away)}\`}";
export const NEW_SCORE="function scoreLabel(f){if(classify(f)==='scheduled')return'—';const p=scorePair(f);return p.home===null||p.away===null?'—':\`\${show(p.home)}-\${show(p.away)}\`}";
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function patchJs(s){
 assert.equal(sha(Buffer.from(s)),JS_SHA,'LIVE_JS_CHANGED_STOP');
 assert.equal(s.split(OLD_SCORE).length,2,'SCORE_LABEL_ANCHOR_CHANGED');
 const next=s.replace(OLD_SCORE,NEW_SCORE);
 assert.equal(next.replace(NEW_SCORE,OLD_SCORE),s,'OTHER_JS_CHANGE');
 assert(next.includes('host.dataset.v11Count=String(rows.length)'),'ATOMIC_SIGNALS_MUST_STAY');
 assert(next.includes("node.textContent.trim().toLowerCase()==='no active signal'"),'GHOST_FIX_MUST_STAY');
 return next;
}
export function patchHtml(s){
 assert.equal(sha(Buffer.from(s)),HTML_SHA,'LIVE_HTML_CHANGED_STOP');
 assert.equal(s.split(OLD_TAG).length,2,'FEATURED_SCRIPT_TAG_DRIFT');
 const next=s.replace(OLD_TAG,NEW_TAG);
 assert.equal(next.replace(NEW_TAG,OLD_TAG),s,'HTML_CHANGED_OUTSIDE_SCOPE');
 return next;
}
export function patchWorker(source){
 assert.equal(sha(Buffer.from(source)),MAIN_SHA,'ACTIVE_WORKER_SOURCE_CHANGED_STOP');
 assert.equal(source.split('export default {').length,2,'MAIN_EXPORT_DRIFT');
 const block=String.raw`
const __b46ScoreOld=__OLD_SCORE__;
const __b46ScoreNew=__NEW_SCORE__;
const __b46ScoreOldTag=__OLD_TAG__;
const __b46ScoreNewTag=__NEW_TAG__;
export default {...__b46BeforeShortDash20261023,async fetch(request,env,ctx){
 const response=await __b46BeforeShortDash20261023.fetch.call(__b46BeforeShortDash20261023,request,env,ctx);
 if(request.method!=='GET'||response.status!==200)return response;
 const path=new URL(request.url).pathname,js=path==='/dashboard-v2-stage3-featured-facts-20261013a.js',html=path==='/'||path==='/index.html';
 if(!js&&!html)return response;
 const type=String(response.headers.get('content-type')||'').toLowerCase();
 if(js&&!type.includes('javascript'))throw Error('SCORE_JS_MIME_CHANGED');
 if(html&&!type.includes('text/html'))throw Error('SCORE_HTML_MIME_CHANGED');
 const body=await response.text();
 const old=js?__b46ScoreOld:__b46ScoreOldTag,changed=js?__b46ScoreNew:__b46ScoreNewTag;
 if(body.split(old).length!==2)throw Error('SCORE_SOURCE_ANCHOR_DRIFT');
 const out=body.replace(old,changed),headers=new Headers(response.headers);
 headers.delete('content-length');headers.delete('etag');
 if(js){headers.set('cache-control','no-cache, must-revalidate');headers.set('x-ball46-score-dash','short-hyphen-20261023');}
 return new Response(out,{status:response.status,statusText:response.statusText,headers});
}};
`;
 const ready=block.replace('__OLD_SCORE__',JSON.stringify(OLD_SCORE)).replace('__NEW_SCORE__',JSON.stringify(NEW_SCORE)).replace('__OLD_TAG__',JSON.stringify(OLD_TAG)).replace('__NEW_TAG__',JSON.stringify(NEW_TAG));
 const next=source.replace('export default {','const __b46BeforeShortDash20261023 = {')+'\n'+ready;
 assert.equal(next.split('export default {').length,2,'OUTPUT_EXPORT_DRIFT');
 return next;
}

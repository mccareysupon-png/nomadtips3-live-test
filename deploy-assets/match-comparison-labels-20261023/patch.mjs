import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BASE_VERSION='55e8db05-c9a7-4665-b9fe-ada34e57804f';
export const BASE_MAIN_SHA='953745d9d9926d5c51d6e1e32f025dd98c71af90719c28f22b0da984b4908438';
export const BASE_HTML_SHA='993b3d079e83bd7a72e7977a485183b400ca0965365407f614b8ec28d8fd7c06';
export const OLD_HOME=String.raw`content:"MATCH COMPARISON\A● HOME · " attr(data-v12-home)!important;`;
export const OLD_AWAY=String.raw`content:"LIVE STATS\A" attr(data-v12-away) " · AWAY ●"!important;`;
export const NEW_HOME=String.raw`content:"MATCH COMPARISON\A HOME"!important;`;
export const NEW_AWAY=String.raw`content:"LIVE STATS\A AWAY"!important;`;
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function patchHtml(html){
 assert.equal(sha(Buffer.from(html)),BASE_HTML_SHA,'BASE_HTML_CHANGED');
 assert.equal(html.split(OLD_HOME).length,2,'HOME_CSS_ANCHOR_CHANGED');
 assert.equal(html.split(OLD_AWAY).length,2,'AWAY_CSS_ANCHOR_CHANGED');
 const updated=html.replace(OLD_HOME,NEW_HOME).replace(OLD_AWAY,NEW_AWAY);
 assert.equal(updated.replace(NEW_HOME,OLD_HOME).replace(NEW_AWAY,OLD_AWAY),html,'UNEXPECTED_HTML_MUTATION');
 assert.equal(updated.slice(updated.indexOf('</head>')),html.slice(html.indexOf('</head>')),'BODY_CHANGED');
 return updated;
}
export function patchWorker(src){
 assert.equal(sha(Buffer.from(src)),BASE_MAIN_SHA,'ACTIVE_SOURCE_MOVED');
 const anchor='export default {',wrapper='const __b46BeforeCompareNames20261023 = {';
 assert.equal(src.split(anchor).length,2,'EXPORT_ANCHOR_COUNT_CHANGED');
 const helper=String.raw`
const __b46CmpOldHome = __OLD_HOME__;
const __b46CmpOldAway = __OLD_AWAY__;
const __b46CmpNewHome = __NEW_HOME__;
const __b46CmpNewAway = __NEW_AWAY__;
export default {...__b46BeforeCompareNames20261023,async fetch(request,env,ctx){
 const response=await __b46BeforeCompareNames20261023.fetch.call(__b46BeforeCompareNames20261023,request,env,ctx);
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||(path!=='/'&&path!=='/index.html')||response.status!==200||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
 const source=await response.text();
 if(source.split(__b46CmpOldHome).length!==2||source.split(__b46CmpOldAway).length!==2)throw Error('MATCH_COMPARISON_ANCHOR_DRIFT');
 const html=source.replace(__b46CmpOldHome,__b46CmpNewHome).replace(__b46CmpOldAway,__b46CmpNewAway);
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
 headers.set('x-ball46-comparison-labels','home-away-only-20261023');
 return new Response(html,{status:response.status,statusText:response.statusText,headers});
}};
`;
 const generated=helper.replace('__OLD_HOME__',JSON.stringify(OLD_HOME)).replace('__OLD_AWAY__',JSON.stringify(OLD_AWAY)).replace('__NEW_HOME__',JSON.stringify(NEW_HOME)).replace('__NEW_AWAY__',JSON.stringify(NEW_AWAY));
 const output=src.replace(anchor,wrapper)+'\n'+generated;
 assert.equal(output.split('export default {').length,2,'WRAPPER_EXPORT_COUNT');
 assert(output.includes('__b46BeforeCompareNames20261023'));
 return output;
}

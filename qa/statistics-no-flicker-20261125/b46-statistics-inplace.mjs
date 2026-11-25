// Surgical patch for effective /longterm-performance-343.js on BALL46 Statistics.
export const MARK='B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125';
function once(source,old,next,label){
 if(source.split(old).length!==2)throw Error('STATS_SOURCE_DRIFT_'+label);
 return source.replace(old,next);
}
const helper=String.raw`
/* B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125
 * Reconcile statistics markup in place. Keep live card, controls and SVG
 * element identities across 7D/30D/90D/ALL and receiver refresh.
 * Never touch other dashboard cards, match panels or navigation.
 */
function b46StatDiff(oldNode,newNode){
 if(oldNode.nodeType!==newNode.nodeType||oldNode.nodeName!==newNode.nodeName){
   oldNode.replaceWith(newNode);return;
 }
 if(oldNode.nodeType===3){
   if(oldNode.nodeValue!==newNode.nodeValue)oldNode.nodeValue=newNode.nodeValue;
   return;
 }
 if(oldNode.nodeType!==1)return;
 for(const a of [...oldNode.attributes]){
   if(!newNode.hasAttribute(a.name))oldNode.removeAttribute(a.name);
 }
 for(const a of [...newNode.attributes]){
   if(oldNode.getAttribute(a.name)!==a.value)oldNode.setAttribute(a.name,a.value);
 }
 const existing=[...oldNode.childNodes],upcoming=[...newNode.childNodes];
 for(let i=0;i<upcoming.length;i++){
   if(i>=existing.length)oldNode.appendChild(upcoming[i]);
   else b46StatDiff(existing[i],upcoming[i]);
 }
 for(let i=upcoming.length;i<existing.length;i++)existing[i].remove();
}
function b46StatApply(shell,markup){
 const existing=shell.querySelector(':scope > .f46-card');
 if(!existing){shell.innerHTML=markup;return}
 const temp=document.createElement('div');
 temp.innerHTML=markup;
 const next=temp.querySelector(':scope > .f46-card');
 if(!next){throw Error('STABLE_CHART_MARKUP_MISSING')}
 b46StatDiff(existing,next);
}
`;
export function patchStatisticsAsset(original){
 if(typeof original!=='string'||original.length<15000)throw Error('STATISTICS_JS_ABSENT');
 if(original.includes(MARK))throw Error('ALREADY_PATCHED');
 const start="function renderFromStats(s,source){";
 const draw=" shell.innerHTML='<article class=\"f46-card\">";
 const end="+\'</article>\';card.dataset.b46StatisticsSource=source;";
 const loading="if(sh)sh.innerHTML='<div class=\"f46-empty\">Loading performance…</div>'";
 const replacement="if(sh&&!sh.querySelector(':scope > .f46-card'))sh.innerHTML='<div class=\"f46-empty\">Loading performance…</div>'";
 let s=once(original,start,helper+"\n"+start,'INSERT');
 s=once(s,draw," b46StatApply(shell,'<article class=\"f46-card\">",'CARD_START');
 s=once(s,end,"+'</article>');card.dataset.b46StatisticsSource=source;",'CARD_END');
 s=once(s,loading,replacement,'NO_LOADING_OVER_EXISTING_CHART');
 if(!s.includes(MARK))throw Error('PATCH_MARKER_MISSING');
 return s;
}
export async function servePatchedStatistics(request,original,env,context){
 const response=await original.fetch(request,env,context);
 if(!response.ok||!response.headers.get('content-type')?.includes('javascript'))return response;
 const before=await response.text();
 const after=patchStatisticsAsset(before);
 const headers=new Headers(response.headers);
 for(const k of ['content-length','content-encoding','etag','last-modified'])headers.delete(k);
 headers.set('cache-control','no-store');
 headers.set('x-b46-statistics-inplace','production-statistics-20261125');
 return new Response(after,{status:response.status,statusText:response.statusText,headers});
}

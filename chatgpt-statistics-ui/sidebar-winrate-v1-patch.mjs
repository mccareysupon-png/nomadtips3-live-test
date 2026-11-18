// Staging-only patch functions. Apply to exact active release sources, not staging defaults.
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('SIDEBAR_ANCHOR_'+a.slice(0,100));return s.replace(a,b)};
export function patchProjection(s){
 s=once(s,"const groups=['all',...MARKET_GROUPS]", "import {optionalSidebar} from './sidebar-winrate-v1.mjs';\nconst groups=['all',...MARKET_GROUPS]");
 return once(s,"return json({...g,generation:s.generation,sequence:s.sequence,readOnly:true});","return json({...g,generation:s.generation,sequence:s.sequence,readOnly:true,sidebarWinRates:optionalSidebar(graphs)});");
}
export function patchProxy(s){
 s=once(s,"const markets=new Set(","import {validSidebar} from './sidebar-winrate-v1.mjs';\nconst markets=new Set(");
 return once(s,"summary:s,counts:c,series:d.series},200,'RECEIVER')","summary:s,counts:c,series:d.series,...(validSidebar(d.sidebarWinRates)?{sidebarWinRates:d.sidebarWinRates}:{})},200,'RECEIVER')");
}
export function patchBrowserChart(s){
 const a="b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');";
 return once(s,a,"if(g.sidebarWinRates)window.__B46_SIDEBAR_WINRATES?.(g.sidebarWinRates,g.sequence);"+a);
}
export function patchWorkspace(s){
 // Discover the count node from the existing native renderer, not via DOM position.
 const i=s.indexOf('function renderStatNav(){');
 if(i<0||i!==s.lastIndexOf('function renderStatNav(){'))throw Error('SIDEBAR_NAV_ANCHOR');
 const e=s.indexOf('\nfunction ',i+1);if(e<0)throw Error('SIDEBAR_NAV_END');
 const native=s.slice(i,e);
 const selectors=[...native.matchAll(/\.querySelector\((['"])([^'"]+)\1\)/g)].map(m=>m[2]);
 const countSelector=native.match(/const count=b\.querySelector\((['"])([^'"]+)\1\)/)?.[2]??selectors.find(x=>/count/i.test(x));
 if(!countSelector)throw Error('SIDEBAR_COUNT_SELECTOR_NOT_FOUND '+native.slice(0,900));
 const pre=String.raw`
const b46SidebarAliases={all:'all',ah:'AH','1x2':'1X2',ou:'O/U',btts:'BTTS',corners:'Corners',cards:'Cards',other:'Other'};
let b46SidebarState=null,b46SidebarSeq=-1;
const b46SidebarNode=button=>button.querySelector(__COUNT_SELECTOR__);
function b46PaintSidebar(){
 const nodes=$$('[data-stat-market]');
 for(const b of nodes){
  const name=b46SidebarAliases[b.dataset.statMarket],el=b46SidebarNode(b);
  if(!el||!name)continue;
  const value=b46SidebarState?.[name]?.rate;
  el.textContent=Number.isFinite(value)?value.toFixed(2)+'%':'—';
  el.dataset.b46WinRate='1';el.title='All-time win rate';
 }
}
window.__B46_SIDEBAR_WINRATES=(v,seq)=>{
 if(!Number.isSafeInteger(seq)||seq<b46SidebarSeq||!v||!Object.values(b46SidebarAliases).every(k=>v[k]&&Number.isSafeInteger(v[k].settled)&&v[k].settled>=0&&(v[k].rate===null||Number.isFinite(v[k].rate)&&v[k].rate>=0&&v[k].rate<=100)))return;
 b46SidebarSeq=seq;b46SidebarState=v;b46PaintSidebar();
};
`.replace('__COUNT_SELECTOR__',JSON.stringify(countSelector));
 // Keep market selection and navigation, disable the legacy row-count calculation exclusively for the sidebar.
 // Native renderStatNav updates active classes and count text; replace its entire function with equivalent active state + win rate.
 const end=native.lastIndexOf('}');if(end<0)throw Error('SIDEBAR_NAV_CLOSING');
 const navBody="function renderStatNav(){$$('[data-stat-market]').forEach(b=>b.classList.toggle('active',state.view==='statistics'&&b.dataset.statMarket===state.market));b46PaintSidebar()}";
 // Verify that native renderer has only the known count + active responsibilities; if other logic exists, fail closed and review.
 if(!native.includes('marketCounts()')||!native.includes("classList.toggle('active'")||!native.includes('textContent'))throw Error('SIDEBAR_NAV_UNEXPECTED '+native.slice(0,1000));
 // Use exact function boundary rather than replacing neighboring definitions.
 const close=native.indexOf('})}',native.indexOf('forEach'));if(close<0)throw Error('SIDEBAR_NAV_CLOSE_UNKNOWN '+native.slice(0,1000));
 const old=native.slice(0,close+3);
 s=once(s,old,pre+navBody);
 // First paint before any accepted graph; no history loading to populate counts.
 s=once(s,"function init(){const status=parseRoute();","function init(){b46PaintSidebar();const status=parseRoute();");
 return {source:s,countSelector,old};
}

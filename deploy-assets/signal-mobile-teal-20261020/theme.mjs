export const MARKER='b46-signal-mobile-deep-teal-v2-20261020';
export const SIGNAL_OVERLAY=String.raw`<style id="b46-signal-mobile-deep-teal-v2-20261020">
@media(max-width:767px){
html[data-theme="dark"][data-b46-signal-mobile-v2="1"] body .workspace.singlepage .status-section .league-block > article.match-row{
 background-color:#1C3029!important;
 background-image:linear-gradient(135deg,#1C3029 0%,#15251F 100%)!important;
 border-color:transparent!important;
 box-shadow:0 5px 13px rgba(0,0,0,.21),inset 0 1px 0 rgba(255,255,255,.025)!important;
}
html[data-theme="dark"][data-b46-signal-mobile-v2="1"] body .workspace.singlepage .status-section .league-block > article.match-row.active[aria-expanded="true"]{
 background-color:#2C5141!important;
 background-image:linear-gradient(110deg,#2C5141 0%,#213D33 100%)!important;
 border-color:transparent!important;
 border-radius:8px 8px 0 0!important;
 box-shadow:inset 1px 0 0 #2C5141,inset -1px 0 0 #2C5141,inset 0 1px 0 rgba(255,255,255,.045),0 5px 14px rgba(0,0,0,.24)!important;
}
html[data-theme="dark"][data-b46-signal-mobile-v2="1"] body .workspace.singlepage .status-section .league-block > article.match-row.active[aria-expanded="true"] + section.match-expanded[data-expanded-match]{
 background-color:#15241E!important;
 background-image:linear-gradient(180deg,#192D25 0%,#15241E 16%,#101A15 100%)!important;
 border-color:transparent!important;
 border-radius:0 0 10px 10px!important;
 box-shadow:inset 1px 0 0 #2C5141,inset -1px 0 0 #2C5141,inset 0 -1px 0 #2C5141,0 9px 20px rgba(0,0,0,.26)!important;
}
}
</style>
<script>
(function(){
 'use strict';
 if(window.__b46SignalMobileV2Installed)return;
 window.__b46SignalMobileV2Installed=true;
 const key='data-b46-signal-mobile-v2';
 const sync=()=>{
  const on=new URL(location.href).searchParams.get('view')==='signal';
  if(on)document.documentElement.setAttribute(key,'1');
  else document.documentElement.removeAttribute(key);
 };
 let queued=false;
 const next=()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;sync()});
 };
 document.addEventListener('click',next,true);
 window.addEventListener('popstate',next);
 window.addEventListener('hashchange',next);
 function start(){
  sync();
  new MutationObserver(next).observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
</script>`;
export function injectSignalTheme(html){
 if(typeof html!=='string'||!html.includes('</body>'))throw Error('SIGNAL_HTML_MISSING');
 if(!html.includes('b46-mobile-ultrasoft-flow-v3-20261020')||!html.includes('b46-pc-seamless-drawer-20261020'))throw Error('ACTIVE_BASE_FEATURES_MISSING');
 if(html.includes(MARKER))throw Error('SIGNAL_THEME_ALREADY_PRESENT');
 return html.replace('</body>',SIGNAL_OVERLAY+'</body>');
}

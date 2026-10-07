import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
const css=(await publicFile('/dashboard-v2-tune.css')).toString('utf8');
const js=(await publicFile('/singlepage-workspace-343.js')).toString('utf8');
const h=html.indexOf('MATCH STATUS');
console.log('HTML_SHA='+sha(html));
console.log('MATCH_STATUS_HTML='+html.slice(h-250,h+1500).replace(/\s+/g,' '));
for(const sel of ['.filter','[data-status-filter]','.rail-title','.rail-card']){
  let pos=0,n=0;
  while(n<12){
    const i=css.indexOf(sel,pos); if(i<0) break;
    console.log('CSS '+sel+' @'+i+' '+css.slice(Math.max(0,i-260),Math.min(css.length,i+850)).replace(/\s+/g,' '));
    pos=i+sel.length;n++;
  }
}
const j=js.indexOf('MATCH STATUS');
console.log('JS_MATCH_STATUS='+js.slice(Math.max(0,j-700),Math.min(js.length,j+1200)).replace(/\s+/g,' '));
console.log('ACTIVE_END='+await activeVersion());

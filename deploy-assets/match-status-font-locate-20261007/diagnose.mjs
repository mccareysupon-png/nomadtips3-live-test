import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const css=(await publicFile('/dashboard-v2-tune.css')).toString('utf8');
const html=(await publicFile('/index.html')).toString('utf8');
console.log('CSS_SHA='+sha(css));
console.log('INDEX_SHA='+sha(html));
for(const needle of ['.rail-title','.filter{','.filter {','.workspace-nav-row','font-size','font-weight']){
  let from=0,n=0;
  while(n<25){
    const i=css.indexOf(needle,from); if(i<0)break;
    const around=css.slice(Math.max(0,i-400),Math.min(css.length,i+900)).replace(/\s+/g,' ');
    if(/rail-title|filter|workspace-nav-row/.test(around)) console.log('@@ '+needle+' @'+i+' @@ '+around);
    from=i+needle.length;n++;
  }
}
const h=html.indexOf('<div class="rail-card"><div class="rail-title">MATCH STATUS</div>');
console.log('MATCH_HTML='+html.slice(h,h+1200).replace(/\s+/g,' '));
console.log('ACTIVE_END='+await activeVersion());

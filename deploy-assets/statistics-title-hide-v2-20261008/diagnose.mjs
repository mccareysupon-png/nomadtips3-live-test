import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const cur=await inspect();
console.log('ACTIVE='+cur.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
console.log('INDEX_SHA='+sha(html));
const domNeedle='<div class="rail-card workspace-stats-card">';
const p=html.indexOf(domNeedle);
console.log('STATS_DOM_FOUND='+(p>=0));
if(p>=0) console.log('STATS_DOM='+html.slice(p,p+1200).replace(/\s+/g,' '));
for(const file of ['dashboard-v2.css','dashboard-v2-tune.css','singlepage-workspace-343.css','mobile-menu-classic-343.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('\nFILE='+file+' SHA='+sha(src));
  for(const needle of ['.workspace-stats-card .rail-title{','.workspace-stats-card .rail-title small{','.workspace.singlepage>.left-rail .rail-title{']){
    let pos=0,n=0;
    while(n<20){const i=src.indexOf(needle,pos); if(i<0)break; console.log('HIT '+needle+' @'+i+' '+src.slice(Math.max(0,i-250),Math.min(src.length,i+900)).replace(/\s+/g,' ')); pos=i+needle.length;n++}
  }
}
console.log('ACTIVE_END='+await activeVersion());

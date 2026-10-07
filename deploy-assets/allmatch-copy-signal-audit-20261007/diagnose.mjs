import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const cur=await inspect();
console.log('ACTIVE='+cur.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
console.log('INDEX_SHA='+sha(html));
const domStart=html.indexOf('<div class="rail-card"><div class="rail-title">MATCH STATUS</div>');
console.log('MATCH_DOM='+html.slice(domStart,domStart+1100).replace(/\s+/g,' '));
for(const file of ['dashboard-v2.css','dashboard-v2-tune.css','singlepage-workspace-343.css','mobile-menu-classic-343.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('\nFILE='+file+' SHA='+sha(src));
  const needles=[
    '.filter,.league-filter{',
    '.filter span,.league-filter span{',
    '.filter b,.league-filter b{',
    '.workspace-nav-row{',
    '.workspace-nav-row span{',
    '.workspace-nav-row b{',
    '[data-workspace-view="signal"]',
    '[data-status-filter="all"]',
    '.filter.active',
    '.workspace-nav-row.active'
  ];
  for(const needle of needles){
    let from=0,n=0;
    while(n<20){
      const i=src.indexOf(needle,from); if(i<0)break;
      console.log('HIT '+needle+' @'+i+' '+src.slice(Math.max(0,i-260),Math.min(src.length,i+900)).replace(/\s+/g,' '));
      from=i+needle.length;n++;
    }
  }
}
console.log('ACTIVE_END='+await activeVersion());

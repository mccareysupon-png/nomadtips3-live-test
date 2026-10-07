import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
console.log('INDEX_SHA='+sha(html));
console.log('ALL_PATCH_PRESENT='+html.includes('B46_MATCH_STATUS_ALLMATCHES_INTER_110_20261007'));
for(const sig of [
  'button[data-status-filter="all"] > span',
  'font-size:12.1px!important',
  'button[data-status-filter="all"] > b',
  'font-size:9.9px!important'
]) console.log(sig+'='+html.includes(sig));

for(const file of ['dashboard-v2.css','dashboard-v2-tune.css','singlepage-workspace-343.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('\nFILE='+file+' SHA='+sha(src));
  const needles=['.filter:hover','.filter.active',':hover > :is(span,b,strong,small)',':hover > span','[data-status-filter="all"]','font-weight:900','color:var(--green)'];
  for(const needle of needles){
    let pos=0,n=0;
    while(n<20){
      const i=src.indexOf(needle,pos); if(i<0)break;
      console.log('HIT '+needle+' @'+i+' '+src.slice(Math.max(0,i-500),Math.min(src.length,i+1100)).replace(/\s+/g,' '));
      pos=i+needle.length;n++;
    }
  }
}
console.log('ACTIVE_END='+await activeVersion());

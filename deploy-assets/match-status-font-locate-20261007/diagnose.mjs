import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
for(const file of ['dashboard-v2.css','singlepage-workspace-343.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('FILE='+file+' SHA='+sha(src));
  for(const needle of ['.rail-title{','.filter,.league-filter{','.filter b,.league-filter b{','.workspace-nav-row{','.workspace-nav-row b{']){
    const i=src.indexOf(needle);
    console.log('NEEDLE='+needle+' POS='+i+' SNIP='+(i>=0?src.slice(i,Math.min(src.length,i+700)).replace(/\s+/g,' '):''));
  }
}
console.log('ACTIVE_END='+await activeVersion());

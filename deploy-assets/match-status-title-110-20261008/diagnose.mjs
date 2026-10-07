import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const cur=await inspect();
console.log('ACTIVE='+cur.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
console.log('INDEX_SHA='+sha(html));
for(const s of ['B46_MATCH_STATUS_INTER_110_20261007','B46_MATCH_STATUS_TITLE_110_20261008','font-size:9.9px!important']) console.log(s+'='+html.includes(s));
const p=html.indexOf('B46_MATCH_STATUS_INTER_110_20261007');
if(p>=0) console.log('OLD_PATCH='+html.slice(Math.max(0,p-400),Math.min(html.length,p+1800)).replace(/\s+/g,' '));
for(const file of ['dashboard-v2.css','dashboard-v2-tune.css','singlepage-workspace-343.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('\nFILE='+file+' SHA='+sha(src));
  for(const needle of ['.rail-title{','.workspace.singlepage>.left-rail .rail-title{']){
    let pos=0,n=0;
    while(n<20){const i=src.indexOf(needle,pos); if(i<0)break; console.log('HIT '+needle+' @'+i+' '+src.slice(Math.max(0,i-220),Math.min(src.length,i+700)).replace(/\s+/g,' ')); pos=i+needle.length;n++}
  }
}
console.log('ACTIVE_END='+await activeVersion());

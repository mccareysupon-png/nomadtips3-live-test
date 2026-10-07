import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
console.log('INDEX_SHA='+sha(html));
for(const sig of ['B46_MATCH_STATUS_INTER_110_20261007','font-size:12.1px!important','font-size:9.9px!important','font-size:11px!important','font-size:8.8px!important']){
  console.log(sig+'='+html.includes(sig));
}
const hrefs=[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m=>m[1].split('?')[0]);
for(const path0 of hrefs){
  if(!path0.endsWith('.css'))continue;
  const path=path0.startsWith('/')?path0:'/'+path0;
  let src;try{src=(await publicFile(path)).toString('utf8')}catch{continue}
  const blocks=src.split('}');
  const hits=blocks.filter(b=>/(data-status-filter|\.filter\s+span|\.filter>span|\.filter > span|workspace-nav-row\s+span|workspace-nav-row>span)/.test(b) && /font-(size|family|weight)/.test(b));
  if(hits.length){
    console.log('\nFILE='+path+' SHA='+sha(src)+' HITS='+hits.length);
    for(const h of hits.slice(0,80)) console.log('RULE='+h.replace(/\s+/g,' ')+'}');
  }
}
console.log('ACTIVE_END='+await activeVersion());

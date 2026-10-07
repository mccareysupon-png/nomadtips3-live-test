import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
const hrefs=[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m=>m[1]);
for(const href of hrefs){
  const path=href.split('?')[0];
  if(!path.endsWith('.css'))continue;
  let src;try{src=(await publicFile(path.startsWith('/')?path:'/'+path)).toString('utf8')}catch(e){continue}
  const hits=[];
  for(const needle of ['.rail-title','.filter','.workspace-nav-row']){
    let pos=0;while(true){const i=src.indexOf(needle,pos);if(i<0)break;hits.push({needle,i});pos=i+needle.length}
  }
  if(!hits.length)continue;
  console.log('CSS='+path+' SHA='+sha(src)+' HITS='+hits.length);
  for(const {needle,i} of hits.slice(0,80)){
    console.log('HIT '+needle+' @'+i+' '+src.slice(Math.max(0,i-280),Math.min(src.length,i+800)).replace(/\s+/g,' '));
  }
}
console.log('ACTIVE_END='+await activeVersion());

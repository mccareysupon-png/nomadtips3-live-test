import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const html=(await publicFile('/index.html')).toString('utf8');
const hrefs=[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m=>m[1]);
console.log('STYLES='+JSON.stringify(hrefs));
for(const href of hrefs){
  if(!href.endsWith('.css'))continue;
  let src;try{src=(await publicFile(href.startsWith('/')?href:'/'+href)).toString('utf8')}catch(e){console.log('FAIL '+href+' '+e.message);continue}
  const hits=[];
  for(const needle of ['.rail-title','.filter','.workspace-nav-row','data-status-filter']){
    let pos=0;
    while(true){const i=src.indexOf(needle,pos);if(i<0)break;hits.push({needle,i});pos=i+needle.length}
  }
  if(!hits.length)continue;
  console.log('CSS='+href+' SHA='+sha(src)+' HITS='+hits.length);
  for(const {needle,i} of hits.slice(0,60)){
    const s=src.slice(Math.max(0,i-500),Math.min(src.length,i+1200));
    if(/font-size|font-weight|font-family/.test(s)) console.log('HIT '+needle+' @'+i+' '+s.replace(/\s+/g,' '));
  }
}
console.log('ACTIVE_END='+await activeVersion());

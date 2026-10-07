import { inspect, publicFile, activeVersion, sha } from '../daily-performance-20261005/production.mjs';

const current=await inspect();
console.log('ACTIVE='+current.restore.version);
const files=['index.html','singlepage-workspace-343.js','dashboard-v2-stage3.js','dashboard-v2-tune.css','dashboard-v2-tune.js'];
const needles=['search-box','workspace-stable-toolbar-host','board-toolbar','data-search','placeholder=','Search','search'];
for(const file of files){
  let source;
  try{source=(await publicFile('/'+file)).toString('utf8')}catch(e){console.log('FETCH_FAIL '+file+' '+e.message);continue}
  console.log('\n===FILE '+file+' SHA='+sha(source)+' BYTES='+Buffer.byteLength(source)+'===');
  const seen=new Set();
  for(const needle of needles){
    let pos=0,count=0;
    while(count<12){
      const i=source.toLowerCase().indexOf(needle.toLowerCase(),pos);
      if(i<0)break;
      const key=Math.floor(i/120);
      if(!seen.has(key)){
        seen.add(key);
        console.log('\n@@ '+needle+' @'+i+' @@\n'+source.slice(Math.max(0,i-900),Math.min(source.length,i+needle.length+1700)).replace(/\n/g,' '));
      }
      pos=i+needle.length;
      count++;
    }
  }
}
console.log('ACTIVE_END='+await activeVersion());

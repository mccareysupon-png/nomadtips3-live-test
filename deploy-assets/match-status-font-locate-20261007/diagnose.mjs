import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';

const current=await inspect();
console.log('ACTIVE='+current.restore.version);
for(const file of ['index.html','singlepage-workspace-343.js','dashboard-v2-tune.css','dashboard-v2-stage3.js']){
  let src='';
  try{src=(await publicFile('/'+file)).toString('utf8')}catch(e){console.log('FETCH_FAIL '+file+' '+e.message);continue}
  console.log('\n=== '+file+' SHA='+sha(src)+' BYTES='+Buffer.byteLength(src)+' ===');
  for(const needle of ['MATCH STATUS','data-status-filter','status-filter','workspace-nav-row','MATCHES','Waiting','Live','Upcoming','Finished']){
    let from=0,count=0;
    while(count<20){
      const i=src.indexOf(needle,from);
      if(i<0)break;
      console.log('\n@@ '+needle+' @'+i+' @@\n'+src.slice(Math.max(0,i-700),Math.min(src.length,i+needle.length+1400)).replace(/\n/g,' '));
      from=i+needle.length;count++;
    }
  }
}
console.log('ACTIVE_END='+await activeVersion());

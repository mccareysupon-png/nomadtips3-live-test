import { inspect, publicFile, activeVersion, sha } from '../daily-performance-20261005/production.mjs';

const current=await inspect();
console.log('ACTIVE='+current.restore.version);
for(const file of ['index.html','dashboard-v2-tune.css']){
  const source=(await publicFile('/'+file)).toString('utf8');
  console.log('FILE='+file+' SHA='+sha(source)+' BYTES='+Buffer.byteLength(source));
  for(const needle of ['Inter','Nunito Sans','fonts.googleapis','fonts.gstatic','font-family','search-box']){
    const indexes=[]; let from=0;
    while(indexes.length<30){
      const i=source.toLowerCase().indexOf(needle.toLowerCase(),from);
      if(i<0)break; indexes.push(i); from=i+needle.length;
    }
    console.log('NEEDLE='+needle+' INDEXES='+JSON.stringify(indexes));
    for(const i of indexes.slice(0,8)) console.log(source.slice(Math.max(0,i-350),Math.min(source.length,i+650)).replace(/\n/g,' '));
  }
}
console.log('ACTIVE_END='+await activeVersion());

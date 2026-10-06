import {activeVersion,publicFile,sha} from './production.mjs';
console.log('ACTIVE='+await activeVersion());
for(const p of ['statistics-next.html','statistics-next.js','statistics.html','statistics.js','index.html']){
 try{
  const b=await publicFile('/'+p);
  const t=b.toString('utf8');
  console.log('FILE='+p+' BYTES='+b.length+' SHA='+sha(b));
  for(const pat of ['STATISTICSV2','Total','1X2','Corners','Cards','Other','/api/engine/statistics','fetch(','Promise.all','DOMContentLoaded']){
   if(t.includes(pat)) console.log(p+' HAS '+pat);
  }
 }catch(e){console.log('MISS='+p+' '+e.message)}
}
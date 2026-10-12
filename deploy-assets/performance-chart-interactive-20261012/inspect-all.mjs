import { readFileSync } from 'node:fs';
import { publicFile } from '../daily-performance-20261005/production.mjs';
const list=readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
for(const p0 of list){
  const p=p0.replace(/^\//,'');
  if(!/\.(js|css|html)$/.test(p)) continue;
  try{
    const s=(await publicFile('/'+p)).toString('utf8');
    const needles=['b46-perf','LONG-TERM PERFORMANCE','data-b46-range','data-b46-mode'];
    if(needles.some(n=>s.includes(n))){
      console.log('MATCH_FILE',p,'LEN',s.length);
      for(const n of needles){const i=s.indexOf(n);if(i>=0){console.log('NEEDLE',n);console.log(s.slice(Math.max(0,i-8000),Math.min(s.length,i+30000)));console.log('END')}} 
    }
  }catch(e){}
}
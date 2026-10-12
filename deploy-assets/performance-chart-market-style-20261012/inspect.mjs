import { publicFile } from '../daily-performance-20261005/production.mjs';
const s=(await publicFile('/longterm-performance-343.js')).toString('utf8');
console.log('LEN',s.length);
for(const n of ['function','b46-perf-line','b46-perf-hover-line','mousemove','pointermove','touchmove','render','series','stake','unit']){
 const i=s.indexOf(n);
 if(i>=0){console.log('NEEDLE '+n); console.log(s.slice(Math.max(0,i-5000),Math.min(s.length,i+20000))); console.log('END');}
}
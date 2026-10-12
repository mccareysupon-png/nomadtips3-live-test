import { publicFile } from '../daily-performance-20261005/production.mjs';
const s=(await publicFile('/singlepage-workspace-343.css')).toString('utf8');
for(const n of ['b46-perf-unit-panel','b46-perf-line{','b46-perf-hover-line','b46-perf-axis-text','b46-perf-ybadge']){
 const i=s.indexOf(n); if(i>=0){console.log('CSS',n);console.log(s.slice(Math.max(0,i-3500),Math.min(s.length,i+10000)));console.log('END')}
}
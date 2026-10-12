import { publicFile } from '../daily-performance-20261005/production.mjs';
for (const p of ['singlepage-workspace-343.js','singlepage-workspace-343.css']) {
  const s=(await publicFile('/'+p)).toString('utf8');
  console.log('FILE',p,'LEN',s.length);
  for (const needle of ['b46-perf-svg','b46-perf-chart-wrap','data-b46-mode','data-b46-range','LONG-TERM PERFORMANCE','b46-perf-axis-note']) {
    const i=s.indexOf(needle);
    if(i>=0){
      console.log('SNIP',needle);
      console.log(s.slice(Math.max(0,i-6000),Math.min(s.length,i+18000)));
      console.log('ENDSNIP');
    }
  }
}
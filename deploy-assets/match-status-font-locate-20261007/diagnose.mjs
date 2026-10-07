import { inspect,publicFile,activeVersion,sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
console.log('ACTIVE='+current.restore.version);
for(const file of ['index.html','dashboard-v2-tune.css']){
  const src=(await publicFile('/'+file)).toString('utf8');
  console.log('FILE='+file+' SHA='+sha(src));
  const re=/[^{}]{0,500}(?:\.rail-title|\.filter|\.workspace-nav-row|data-status-filter)[^{}]*\{[^{}]*font-size\s*:[^{}]*\}/g;
  const m=[...src.matchAll(re)];
  console.log('RULE_COUNT='+m.length);
  for(const x of m.slice(0,80)) console.log('RULE '+x[0].replace(/\s+/g,' '));
}
console.log('ACTIVE_END='+await activeVersion());

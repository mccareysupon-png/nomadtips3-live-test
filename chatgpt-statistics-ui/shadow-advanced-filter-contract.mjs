// READ ONLY — report actual deployed filter controls/logic without executing the page code.
const host='https://www.ball46.com';
const urls=['/singlepage-workspace-343.js','/longterm-performance-343.js','/?view=statistics'];
const summary=[];
for(const path of urls){
 const r=await fetch(host+path,{headers:{'user-agent':'Mozilla/5.0 B46-ReadOnly','cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('ASSET_HTTP_'+r.status);
 const s=await r.text(),controls={};
 for(const key of ['data-stat-market','data-sp-filter','data-sp-variant','data-f46-range','data-range','data-f46-series','data-period','data-stat-range']){
  controls[key]=[...new Set([...s.matchAll(new RegExp(key+'\\s*=\\s*["\']([a-zA-Z0-9_./-]{1,32})["\']','g'))].map(m=>m[1]))].sort();
 }
 const anchors={};
 for(const name of ['routeFilter','filteredRows','marketGroup','marketVariant','marketKey','marketDef','selectionKey','f46Points','getPoints']){
  const i=s.indexOf('function '+name+'(');
  if(i<0)continue;
  const sliced=s.slice(i,i+2200),stop=sliced.indexOf('function ',10);
  anchors[name]=sliced.slice(0,stop>0?stop:1100);
 }
 const ranges=s.match(/(?:const|let|var)\s+RANGE_DAYS\s*=\s*\{[^}]{1,400}\}/)?.[0]??null;
 summary.push({path,controls,anchors,ranges});
}
console.log('ADVANCED_FILTER_SOURCE_CONTRACT='+JSON.stringify(summary));

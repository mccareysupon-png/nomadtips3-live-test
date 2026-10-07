import { inspect, publicFile, activeVersion, literals, sha } from '../daily-performance-20261005/production.mjs';

const current=await inspect();
const expected='4996cd2c-988a-449f-8791-60a385e1b1b1';
if(current.restore.version!==expected) throw new Error('PRODUCTION_MOVED:'+current.restore.version);

const files=['singlepage-workspace-343.js','mobile-menu-classic-343.js','workspace-route-guard-343.js'];
const cache=new Map();
for(const file of files) cache.set(file,(await publicFile('/'+file)).toString('utf8'));
const needles=['ball46:workspace-view','data-status-filter','data-stat-market','data-workspace-view','pushState','replaceState','popstate','function set','function apply','workspaceView','scrollTo','scrollTop','scrollY'];

for(const file of files){
 const source=cache.get(file);
 console.log('\n=== '+file+' SHA='+sha(source)+' BYTES='+Buffer.byteLength(source)+' ===');
 for(const needle of needles){
   let start=0,n=0;
   while(n<20){
     const i=source.toLowerCase().indexOf(needle.toLowerCase(),start);
     if(i<0)break;
     console.log('\n@@ '+needle+' @'+i+' @@\n'+source.slice(Math.max(0,i-900),Math.min(source.length,i+needle.length+1500)).replace(/\n/g,' '));
     start=i+needle.length;n++;
   }
 }
}
const lit=literals(current.source);
for(const [name,e] of lit){
 const h=sha(e.value);
 for(const file of files){
   if(h===sha(cache.get(file))) console.log('WORKER_LITERAL_MATCH '+file+' '+name+' '+h);
 }
}
console.log('ACTIVE_END='+await activeVersion());

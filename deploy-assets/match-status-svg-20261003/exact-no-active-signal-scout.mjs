import { activeVersion,getVersion,publicFile,sha } from './production.mjs';
const id=await activeVersion();
const dash=await publicFile('/dashboard-v2-stage3.js','javascript');
const idx=await publicFile('/index.html','html');
const dt=dash.toString('utf8'),it=idx.toString('utf8');
console.log('ACTIVE='+id);
for (const [name,text] of [['dashboard-v2-stage3.js',dt],['index.html',it]]) {
 const lines=text.split('\n');
 lines.forEach((line,i)=>{ if(line.includes('No active signal')) console.log(name+':'+(i+1)+':'+line.trim()); });
}
console.log('DASH_SHA='+sha(dash));console.log('INDEX_SHA='+sha(idx));
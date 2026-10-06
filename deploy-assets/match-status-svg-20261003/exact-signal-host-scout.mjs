import { publicFile } from './production.mjs';
const t=(await publicFile('/dashboard-v2-stage3.js','javascript')).toString('utf8');
const lines=t.split('\n');
for(let i=0;i<lines.length;i++){
 if(/function patchFeatureSignalHost|function signalDetailsHtml|function visibleSignalsFor/.test(lines[i])){
   console.log('---'+(i+1)+'---');for(let j=Math.max(0,i-4);j<Math.min(lines.length,i+8);j++)console.log((j+1)+':'+lines[j]);
 }
}
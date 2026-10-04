import { mkdirSync, writeFileSync } from 'node:fs';
import { publicFile, sha } from './production.mjs';

const target='dashboard-v2-stage3.js';
const buf=await publicFile('/'+target,'javascript');
const src=buf.toString('utf8');
mkdirSync('audit',{recursive:true});
writeFileSync('audit/dashboard-v2-stage3-live.js',src);

function blockFrom(anchor,nextAnchors=[]){
  const a=src.indexOf(anchor);
  if(a<0)return null;
  let b=src.length;
  for(const n of nextAnchors){const i=src.indexOf(n,a+anchor.length);if(i>=0&&i<b)b=i}
  return src.slice(a,b);
}
const render=blockFrom('function renderWorkspaceScorebar()',[
  'function renderBoard()',
  'function setText(',
  'function renderFeatured()',
]);
if(!render)throw new Error('RENDER_WORKSPACE_SCOREBAR_NOT_FOUND');
writeFileSync('audit/renderWorkspaceScorebar.js',render);

const lines=src.split(/\r?\n/);
const hits=[];
for(let i=0;i<lines.length;i++){
  if(/scorebar|score-bar|workspace-score|result-card|pending-card|score-card/i.test(lines[i])){
    const from=Math.max(0,i-3),to=Math.min(lines.length,i+4);
    hits.push({line:i+1,text:lines.slice(from,to).join('\n')});
  }
}
writeFileSync('audit/scorebar-style-hits.json',JSON.stringify(hits,null,2));
const report={ok:true,target,sha256:sha(buf),bytes:buf.length,renderBytes:Buffer.byteLength(render),hitCount:hits.length,markerStableDom:src.includes('B46_STABLE_MATCH_CARD_DOM_20261004')};
writeFileSync('audit/topcards-scout-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
console.log('BALL46_TOPCARDS_SCOUT_PASS');

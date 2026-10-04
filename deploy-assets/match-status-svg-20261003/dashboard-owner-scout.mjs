import { writeFileSync } from 'node:fs';
import { inspect, publicFile, sha, literals } from './production.mjs';

const TARGET='/dashboard-v2-stage3.js';
const current=await inspect();
const bytes=await publicFile(TARGET,'javascript');
const targetText=bytes.toString('utf8');
const targetSha=sha(bytes);
const source=current.source;
const occurrences=[];
for(let from=0;;){const i=source.indexOf(TARGET.slice(1),from);if(i<0)break;occurrences.push(i);from=i+1}
const literalRows=[];
for(const [name,entry] of literals(source)){
  const value=String(entry.value||'');
  const valueSha=sha(Buffer.from(value));
  if(valueSha===targetSha || value.includes("function renderBoard(){") || value.includes("const API='/api/engine/board'")){
    literalRows.push({name,size:Buffer.byteLength(value),sha:valueSha,exactPublicMatch:valueSha===targetSha,containsRenderBoard:value.includes('function renderBoard(){'),containsBoardApi:value.includes("const API='/api/engine/board'")});
    if(valueSha===targetSha)writeFileSync('audit/dashboard-owner-exact-literal.js',value);
  }
}
const contexts=occurrences.map((i,n)=>`--- occurrence ${n+1} @ ${i} ---\n${source.slice(Math.max(0,i-1400),Math.min(source.length,i+2200))}\n`).join('\n');
writeFileSync('audit/dashboard-owner-context.txt',contexts||'NO_TARGET_PATH_OCCURRENCE\n');
const report={activeVersion:current.restore.version,target:TARGET,targetSha,targetBytes:bytes.length,pathOccurrences:occurrences,literals:literalRows,exactLiteralMatches:literalRows.filter(x=>x.exactPublicMatch).map(x=>x.name)};
writeFileSync('audit/dashboard-owner-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
console.log('DASHBOARD_OWNER_SCOUT_SUCCESS');

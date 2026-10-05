import { mkdirSync, writeFileSync } from 'node:fs';
import { inspect, publicFile, sha, literals } from './production.mjs';

const TARGET='dashboard-v2-stage3.js';
mkdirSync('audit',{recursive:true});
const current=await inspect();
const bytes=await publicFile('/'+TARGET,'javascript');
const text=bytes.toString('utf8');
const publicSha=sha(bytes);
writeFileSync('audit/dashboard-v2-stage3-current.js',bytes);
const lit=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');
if(!lit) throw new Error('MULTI_SIGNAL_LITERAL_MISSING');
const literalSha=sha(lit.value);
const report={run:process.env.GITHUB_RUN_ID,activeVersion:current.restore.version,target:TARGET,publicSha,literalSha,literalMatchesPublic:literalSha===publicSha,hasMultiSignal:text.includes('B46_MULTI_SIGNAL_CARD'),hasRenderFeatured:text.includes('function renderFeatured()'),capturedAt:new Date().toISOString()};
writeFileSync('audit/right-signal-probe-report.json',JSON.stringify(report,null,2));
if(literalSha!==publicSha) throw new Error('WORKER_LITERAL_NOT_PUBLIC_SOURCE');
console.log(`CURRENT_DASHBOARD_SHA=${publicSha}`);
console.log(`ACTIVE_VERSION=${current.restore.version}`);
console.log('RIGHT_SIGNAL_PROBE_SUCCESS');

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inspect, publicFile, sha, literals } from './production.mjs';

mkdirSync('audit',{recursive:true});
const current=await inspect();
const dashboard=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');
assert(dashboard,'DASHBOARD_OWNER_LITERAL_MISSING');
const js=dashboard.value;
const publicJs=await publicFile('/dashboard-v2-stage3.js');
assert.equal(sha(Buffer.from(js)),sha(publicJs),'DASHBOARD_OWNER_NOT_PUBLIC_SOURCE');

function excerpts(text,needle,radius=1200){
  const out=[];let pos=0;
  while(true){const i=text.indexOf(needle,pos);if(i<0)break;out.push({needle,index:i,excerpt:text.slice(Math.max(0,i-radius),Math.min(text.length,i+needle.length+radius))});pos=i+needle.length}
  return out;
}
const needles=['FEATURED MATCH','renderFeatured','data-featured','featured','signalDetailsHtml','selectedId'];
const jsMatches=needles.flatMap(n=>excerpts(js,n));
assert(jsMatches.some(x=>x.needle==='renderFeatured'),'RENDER_FEATURED_NOT_FOUND');

const paths=readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
const cssPaths=paths.filter(p=>p.endsWith('.css'));
const cssMatches=[];
for(const p of cssPaths){
  try{
    const b=await publicFile('/'+p);const t=b.toString('utf8');
    for(const n of ['featured','FEATURED','board-featured','featured-card']){
      const hits=excerpts(t,n,700);for(const h of hits)cssMatches.push({path:p,...h});
    }
  }catch{}
}
const report={
  ok:true,
  activeVersion:current.restore.version,
  mainModule:current.version.main_module,
  dashboardOwner:'__B46_MULTI_SIGNAL_STAGE3_JS__',
  dashboardSha:sha(publicJs),
  jsMatches,
  cssPaths,
  cssMatches,
  noWritesToProduction:true
};
writeFileSync('audit/featured-match-current-scout.json',JSON.stringify(report,null,2));
console.log(`ACTIVE_PRODUCTION=${report.activeVersion}`);
console.log(`DASHBOARD_SHA=${report.dashboardSha}`);
console.log(`CSS_PATHS=${cssPaths.join(',')}`);
for(const m of jsMatches){console.log(`\n---JS ${m.needle} @ ${m.index}---\n${m.excerpt}\n---END---`)}
for(const m of cssMatches){console.log(`\n---CSS ${m.path} ${m.needle} @ ${m.index}---\n${m.excerpt}\n---END---`)}
console.log('BALL46_FEATURED_MATCH_READ_ONLY_SCOUT_PASS');

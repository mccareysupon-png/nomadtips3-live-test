import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,api,script,activeVersion,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase} from '../daily-performance-20261005/rail.mjs';

const cur=await inspect();
const settings=await api(`/scripts/${script}/settings`);
const crons=await schedules();
const staged=await stageCurrentRail(cur.version,settings,crons,cur.source);
await verifyRailBase(staged);
assert.equal(await activeVersion(),cur.restore.version,'PRODUCTION_MOVED');

const js=readFileSync(resolve(staged.runtime,'assets','full-market-bookmaker-343.js'),'utf8');
const css=readFileSync(resolve(staged.runtime,'assets','full-market-bookmaker-343.css'),'utf8');
const hits={};
for(const p of ['easybet','easy bet','BOOK_LOGO_URLS','AFFILIATE_URLS','affiliatePriceHtml','bookLabelHtml']){
  const i=js.toLowerCase().indexOf(p.toLowerCase());
  hits[p]=i<0?null:js.slice(Math.max(0,i-800),Math.min(js.length,i+1800));
}
mkdirSync('audit',{recursive:true});
const report={version:cur.restore.version,jsSha:sha(Buffer.from(js)),cssSha:sha(Buffer.from(css)),settingsSha:sha(canonical(settings)),crons,hits};
writeFileSync('audit/preflight.json',JSON.stringify(report,null,2));
writeFileSync('audit/full-market-bookmaker-343.js',js);
writeFileSync('audit/full-market-bookmaker-343.css',css);
console.log('BALL46_EASYBET_PREFLIGHT_OK',JSON.stringify({version:report.version,jsSha:report.jsSha,cssSha:report.cssSha,found:Object.fromEntries(Object.entries(hits).map(([k,v])=>[k,!!v]))}));

import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,api,script,activeVersion,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase} from '../daily-performance-20261005/rail.mjs';

const current=await inspect();
const versionId=current.restore.version;
const settings=await api(`/scripts/${script}/settings`);
const crons=await schedules();
const staged=await stageCurrentRail(current.version,settings,crons,current.source);
await verifyRailBase(staged);
assert.equal(await activeVersion(),versionId,'PRODUCTION_MOVED_DURING_PREFLIGHT');

const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
const js=readFileSync(jsPath,'utf8');
const css=readFileSync(cssPath,'utf8');

const needles=['BOOK_LOGO_URLS','AFFILIATE_URLS','affiliatePriceHtml','bookmakerLogo','book-logo','affiliate','12BET','Betsson','Pinnacle'];
const out={versionId,jsSha:sha(Buffer.from(js)),cssSha:sha(Buffer.from(css)),settingsSha:sha(canonical(settings)),crons,found:{}};
for(const n of needles){
  const i=js.toLowerCase().indexOf(n.toLowerCase());
  out.found[n]=i<0?null:js.slice(Math.max(0,i-700),Math.min(js.length,i+1600));
}
const cNeedles=['book-logo','bookmaker-logo','affiliate','logo'];
out.cssFound={};
for(const n of cNeedles){
  const i=css.toLowerCase().indexOf(n.toLowerCase());
  out.cssFound[n]=i<0?null:css.slice(Math.max(0,i-500),Math.min(css.length,i+1400));
}
mkdirSync('audit',{recursive:true});
writeFileSync('audit/preflight.json',JSON.stringify(out,null,2));
writeFileSync('audit/full-market-bookmaker-343.js',js);
writeFileSync('audit/full-market-bookmaker-343.css',css);
console.log('BALL46_12BET_PREFLIGHT_OK',JSON.stringify({versionId,jsSha:out.jsSha,cssSha:out.cssSha,found:Object.fromEntries(Object.entries(out.found).map(([k,v])=>[k,!!v]))}));

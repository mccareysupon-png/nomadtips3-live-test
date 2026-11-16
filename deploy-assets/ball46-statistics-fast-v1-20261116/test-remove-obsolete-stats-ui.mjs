// Read-only real Production source validation. NO Worker uploads or writes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {removeObsoleteStatsMenu,sanitizeStatsPage,CSS_NEW,CSS_OLD} from './remove-obsolete-stats-ui.mjs';
const url='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc';
const h={authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
async function json(path){
 const r=await fetch(url+path,{headers:h,signal:AbortSignal.timeout(35000)});
 const v=await r.json();if(!r.ok||v.success!==true)throw Error('CLOUDFLARE_READ_ONLY_FAIL_'+r.status);
 return v.result;
}
const live=(await json('/workers/scripts/ball46-production/deployments?per_page=1')).deployments[0];
assert.equal(live.versions.length,1);
assert.equal(live.versions[0].percentage,100);
const version=live.versions[0].version_id;
const bundle=await json('/workers/workers/ball46-production/versions/'+version+'?include=modules');
const mod=bundle.modules.find(m=>m.name==='statistics-menu-entry-20261114.mjs');
assert(mod,'STATS_MENU_MODULE_MISSING');
const original=Buffer.from(mod.content_base64,'base64').toString('utf8');
const built=removeObsoleteStatsMenu(original);
await writeFile('/tmp/b46-stats-menu-no-animation.mjs',built.code);
execFileSync('node',['--check','/tmp/b46-stats-menu-no-animation.mjs']);
assert(built.removedBytes>12000,'EXPECTED_SKELETON_BUNDLE_REMOVAL');
assert(!built.code.includes('b46sl-mini-chart')&&!built.code.includes('b46sl-skeleton'));
const index=await fetch('https://www.ball46.com/?view=statistics',{headers:{'cache-control':'no-store'}});
assert.equal(index.status,200);
const page=await index.text();
const strip=(x,id,tag)=>{
 const st='<'+tag+' id="'+id+'">',i=x.indexOf(st);
 assert(i>=0,'TAG_MISSING_'+id);
 const close='</'+tag+'>',end=x.indexOf(close,i);
 assert(end>i,'NO_TAG_CLOSE_'+id);
 return x.slice(0,i)+x.slice(end+close.length);
};
let before=strip(page,'b46-statistics-visuals-20261114','style');
before=strip(before,'b46-statistics-visuals-20261114-runtime','script');
const after=sanitizeStatsPage(before);
assert(!after.includes('id="'+CSS_OLD+'"')&&!after.includes('b46sl-loading-focus'));
assert(after.includes('id="'+CSS_NEW+'"'));
assert(after.includes('id="b46-statistics-ready-20261022"'));
assert(after.includes('b46-finance-chart-card')||after.includes('sp-stats-content'));
const twice=()=>sanitizeStatsPage(after);
assert.throws(twice,/DUPLICATE_NEW/);
console.log('B46_REMOVE_OLD_UI_SOURCE_TEST='+JSON.stringify({
  result:'PASS',liveVersion:version,activeModules:bundle.modules.length,
  originalBytes:original.length,revisedBytes:built.code.length,removedBytes:built.removedBytes,
  obsoleteLoaderSourceRemoved:true,obsoleteReadyOverlayRemoved:true,
  financeScriptPreserved:true,engineWrites:0,productionWrites:0
}));

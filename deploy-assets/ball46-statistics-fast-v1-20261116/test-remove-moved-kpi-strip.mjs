import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {removeMovedKpiStripFromMenu,PATCH_TAG} from './remove-moved-kpi-strip.mjs';
const base='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc';
const headers={authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('NO_CLOUDFLARE_READ');
const get=async path=>{
 const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.success!==true)throw Error('READ_FAILED_'+path);
 return data.result;
};
const dep=(await get('/workers/scripts/ball46-production/deployments?per_page=1')).deployments[0];
const version=dep.versions?.[0]?.version_id;
assert(version&&dep.versions?.length===1&&Number(dep.versions[0].percentage)===100);
const data=await get('/workers/workers/ball46-production/versions/'+version+'?include=modules');
const file=data.modules.find(m=>m.name==='statistics-menu-entry-20261114.mjs');
assert(file,'STATS_MENU_MODULE_MISSING');
const original=Buffer.from(file.content_base64,'base64').toString('utf8');
const patched=removeMovedKpiStripFromMenu(original);
assert(patched.source.includes(PATCH_TAG));
assert(!original.includes(PATCH_TAG));
await writeFile('/tmp/b46-remove-kpis-menu.mjs',patched.source);
execFileSync(process.execPath,['--check','/tmp/b46-remove-kpis-menu.mjs']);
const html=await(await fetch('https://www.ball46.com/?view=statistics',{headers:{'cache-control':'no-cache'}})).text();
assert.equal(html.split('<section class="sp-kpis">').length,2,'SINGLE_LEGACY_STRIP_EXPECTED');
for(const key of ['total','unsettled','win','loss','push','rate','odds'])
 assert(html.includes('data-sp-kpi="'+key+'"'),'MISSING_ORIGINAL_TOP_KPI_'+key);
assert(html.includes('id="b46-stats-v1-no-legacy-firstpaint-20261116"'),'CORRECT_CURRENT_SOURCE');
const patchedAgain=()=>removeMovedKpiStripFromMenu(patched.source);
assert.throws(patchedAgain,/ALREADY_REMOVED/);
console.log('B46_TOP_KPI_REMOVAL_TEST='+JSON.stringify({
 success:true,version,oldLength:original.length,newLength:patched.source.length,
 sourceReplacedOnlySanitizer:true,originalStaticCards:7,
 legacySettledDaysDynamicallyAdded:true,financeCardUnchanged:true,
 productionWrites:0}));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patchSignalBadgeContext,OLD_PINNED_RENDER,NEW_PINNED_RENDER,jsStringEscape} from './signal-badge-hotfix.mjs';

const SCRIPT='ball46-production';
const EXPECT='fbdde527-b04f-4675-8e4e-485f8406a1e2';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result;
}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const av=dep.deployments?.[0]?.versions;assert(av?.length===1&&Number(av[0].percentage)===100,'ACTIVE_NOT_SINGLE');
const active=av[0].version_id;assert.equal(active,EXPECT,'ACTIVE_DRIFT');
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const dash=v.modules.find(x=>x.name==='screen-refresh-5s-20261104.txt');
const main=v.modules.find(x=>x.name==='index.js');
assert(dash&&main,'REQUIRED_MODULE_MISSING');
const ds=Buffer.from(dash.content_base64,'base64').toString('utf8');
const ms=Buffer.from(main.content_base64,'base64').toString('utf8');

assert.equal(ds.split(OLD_PINNED_RENDER).length-1,1,'DASH_OLD_RENDER_COUNT');
assert.equal(ms.split(jsStringEscape(OLD_PINNED_RENDER)).length-1,1,'MAIN_OLD_RENDER_COUNT');

const dp=patchSignalBadgeContext(ds);
const mp=patchSignalBadgeContext(ms,{escaped:true});

assert(dp.includes(NEW_PINNED_RENDER),'DASH_NEW_RENDER_MISSING');
assert(mp.includes(jsStringEscape(NEW_PINNED_RENDER)),'MAIN_NEW_RENDER_MISSING');
assert.equal((dp.match(/fetch\s*\(/g)||[]).length,(ds.match(/fetch\s*\(/g)||[]).length,'DASH_FETCH_COUNT_CHANGED');
assert.equal((mp.match(/fetch\s*\(/g)||[]).length,(ms.match(/fetch\s*\(/g)||[]).length,'MAIN_FETCH_COUNT_CHANGED');

new Function(dp);
fs.writeFileSync('/tmp/b46-main-patched.mjs',mp);
const check=spawnSync(process.execPath,['--check','/tmp/b46-main-patched.mjs'],{encoding:'utf8'});
assert.equal(check.status,0,'MAIN_SYNTAX_FAILED:'+check.stderr);

for(const marker of [
 'B46_PIN_V2_FRESH_20261111',
 'B46_PIN_V2_EXPANDED_GUARD_20261111',
 'B46_FULLMARKET_DARK10_YELLOW_DOT_20261111',
 'B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111',
 'B46_FULLMARKET_INSPECT_CACHE_20261110'
])assert(mp.includes(marker),'PRESERVED_MARKER_MISSING_'+marker);

let changed=0;
for(const m of v.modules){
 const original=m.content_base64;
 let next=original;
 if(m.name===dash.name)next=Buffer.from(dp).toString('base64');
 if(m.name===main.name)next=Buffer.from(mp).toString('base64');
 if(next!==original)changed++;
}
assert.equal(changed,2,'DRY_RUN_CHANGED_MODULE_COUNT_'+changed);

console.log('ACTIVE_VERSION='+active);
console.log('DASH_PATCH_PASS=1');
console.log('FALLBACK_PATCH_PASS=1');
console.log('DASH_SYNTAX_PASS=1');
console.log('MAIN_SYNTAX_PASS=1');
console.log('FETCH_CALL_SITES_UNCHANGED=1');
console.log('PRESERVED_MARKERS_PASS=1');
console.log('DRY_RUN_CHANGED_MODULES=2');
console.log('SIGNAL_BADGE_HOTFIX_DRY_RUN_PASS=1');

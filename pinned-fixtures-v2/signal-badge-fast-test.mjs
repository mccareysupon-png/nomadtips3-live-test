import assert from 'node:assert/strict';

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR');return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const id=d.deployments?.[0]?.versions?.[0]?.version_id;assert(id);
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
const mod=v.modules.find(m=>m.name==='screen-refresh-5s-20261104.txt');assert(mod,'DASH_MODULE_MISSING');
let src=Buffer.from(mod.content_base64,'base64').toString('utf8');

assert(src.includes('B46_PIN_V2_FRESH_20261111'),'PIN_V2_MISSING');
assert(src.includes('<section class="status-section b46-pin-v2-section" data-status-section="pinned">'),'PINNED_SECTION_MISSING');
assert(src.includes("<section class=\"league-block\">'+pinned.map(rowHtml).join('')+'</section>"),'PINNED_BLOCK_SHAPE_DRIFT');
assert(!src.includes('B46_PIN_V2_SIGNAL_BADGE_FIX_TEST_20261111'),'FIX_ALREADY_PRESENT');

const anchor="function b46PinPaint(row){if(!row)return;";
assert.equal(src.split(anchor).length-1,1,'PIN_PAINT_ANCHOR_NOT_UNIQUE');
const helper=`function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();return;}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';host.append(badge);}const number=String(n),label=n===1?'Signal':'Signals';if(badge.children[1].textContent!==number)badge.children[1].textContent=number;if(badge.children[2].textContent!==label)badge.children[2].textContent=label;badge.setAttribute('aria-label',number+' active '+label.toLowerCase())}
const B46_PIN_V2_SIGNAL_BADGE_FIX_TEST_20261111=true;
function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);`;
const patched=src.replace(anchor,helper);

assert(patched.includes('B46_PIN_V2_SIGNAL_BADGE_FIX_TEST_20261111'),'FIX_MARKER_MISSING');
assert(patched.includes("const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]')"),'SIGNAL_SOURCE_NOT_LOCAL');
assert(patched.includes("host.querySelector(':scope > .b46-league-market-signal-count')"),'BADGE_REUSE_MISSING');
assert(patched.includes("badge.innerHTML='<i aria-hidden=\"true\"></i><b></b><span></span>'"),'BADGE_GEOMETRY_DRIFT');
assert(patched.includes("b46PinSignalBadge(row);"),'PIN_PAINT_CALL_MISSING');
assert(!patched.includes("fetch(" + "'/api" ),'UNEXPECTED_API_LITERAL');

for(const marker of [
 'B46_PIN_V2_FRESH_20261111',
 'B46_SCREEN_REFRESH_5S_20261104',
 'B46_STABLE_MATCH_CARD_DOM_20261004',
 'B46_CARD_SIGNAL_COUNT_COLLISION_FIX_20261004',
 'B46_CARD_SIGNAL_MORE_COMPACT_20261004'
])assert(patched.includes(marker),'PRESERVE_MARKER_LOST_'+marker);

console.log('ACTIVE_BASE='+id);
console.log('CAUSE_PINNED_BLOCK_HAS_NO_LEAGUE_HEAD=1');
console.log('FIX_READS_EXISTING_INLINE_SIGNAL_METADATA=1');
console.log('FIX_REUSES_EXISTING_BADGE_CLASS=1');
console.log('FIX_EXTRA_API=0');
console.log('SIGNAL_BADGE_SOURCE_PATCH_PASS=1');

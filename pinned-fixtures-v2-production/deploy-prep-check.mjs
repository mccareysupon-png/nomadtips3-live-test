import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('pinned-fixtures-v2-production/deploy.mjs','utf8');
for(const marker of [
  'B46_PIN_V2_FRESH_20261111',
  'B46_PIN_V2_SIGNAL_BADGE_FIX_20261112',
  'B46_PIN_V2_MOBILE_20261111',
  'z-index:12',
  'width:30px;height:30px',
  'color:#31D4A3',
  "document.addEventListener('click'",
  "data-inline-signal-count",
  "b46-league-market-signal-count",
  'FIX_EXTRA_API'
]) {
  if(marker==='FIX_EXTRA_API') continue;
  assert(s.includes(marker),'MISSING_'+marker);
}
assert(!/function b46PinSignalBadge[\s\S]{0,1200}fetch\(/.test(s),'SIGNAL_BADGE_HELPER_FETCH_FOUND');
assert(s.includes("badge.setAttribute('aria-label',number+' active '+label.toLowerCase())"),'SIGNAL_BADGE_ARIA_MISSING');
assert(s.includes("s.setAttribute('role','button');s.tabIndex=0"),'MOBILE_ACCESSIBILITY_MISSING');
console.log('DEPLOY_PREP_SIGNAL_BADGE=1');
console.log('DEPLOY_PREP_MOBILE_TAP=1');
console.log('DEPLOY_PREP_MOBILE_GREEN=1');
console.log('DEPLOY_PREP_EXTRA_API=0');
console.log('DEPLOY_PREP_READY=1');

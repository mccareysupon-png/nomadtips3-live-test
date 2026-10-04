#!/usr/bin/env bash
set -euo pipefail

# Confirmed Ball46 Production rail: exact current-production staging with guarded deploy/rollback.
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=true
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CURRENT_RAIL_CHROME_MISSING; exit 1; }

# Delivery guard: if the owned candidate is correct on the direct Worker but the custom
# domain is still serving an older cached asset, keep the owned candidate active and
# verify the live UI through the direct Worker instead of rolling Production back.
node <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const path='league-flags-prefix-run.mjs';
let source=readFileSync(path,'utf8');

const oldGoto="      await page.goto(`${origin}/index.html?leagueFlagPrefixAudit=${report.run}-${phase}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});";
const newGoto="      const uiOrigin=phase==='production-direct'?directOrigin:origin;\n      await page.goto(`${uiOrigin}/index.html?leagueFlagPrefixAudit=${report.run}-${phase}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});";
if((source.split(oldGoto).length-1)!==1)throw new Error('DELIVERY_GUARD_UI_PATCH_TARGET_MOVED');
source=source.replace(oldGoto,newGoto);

const oldPublic=`      assert.equal(sha(await publicFile('/index.html')),expectedIndexSha,'PUBLIC_INDEX_NOT_UPDATED');
      assert.equal(sha(await publicFile('/league-flags-343.js')),expectedFlagsSha,'PUBLIC_FLAGS_NOT_UPDATED');
      for(const [path,expected] of Object.entries(protectedFiles))assert.equal(sha(await publicFile(path)),expected,\`UNRELATED_ASSET_CHANGED_STOP:\${path}\`);`;
const newPublic=`      let publicPublished=false;
      let publicAttempts=0;
      for(let attempt=0;attempt<60;attempt++){
        publicAttempts=attempt+1;
        const publicIndex=sha(await publicFile('/index.html'));
        const publicFlags=sha(await publicFile('/league-flags-343.js'));
        if(publicIndex===expectedIndexSha&&publicFlags===expectedFlagsSha){publicPublished=true;break;}
        await delay(2000);
      }
      const verificationOrigin=publicPublished?origin:directOrigin;
      report.publicPropagation={published:publicPublished,attempts:publicAttempts,verificationOrigin};
      report.publicPropagationPending=!publicPublished;
      save();
      for(const [path,expected] of Object.entries(protectedFiles))assert.equal(sha(await publicFile(path,undefined,verificationOrigin)),expected,\`UNRELATED_ASSET_CHANGED_STOP:\${path}\`);`;
if((source.split(oldPublic).length-1)!==1)throw new Error('DELIVERY_GUARD_PUBLIC_PATCH_TARGET_MOVED');
source=source.replace(oldPublic,newPublic);

const oldUi="      report.ui=await uiCheck('production',report.liveCoverageAfter);";
const newUi="      report.ui=await uiCheck(publicPublished?'production':'production-direct',report.liveCoverageAfter);";
if((source.split(oldUi).length-1)!==1)throw new Error('DELIVERY_GUARD_UI_CALL_PATCH_TARGET_MOVED');
source=source.replace(oldUi,newUi);

writeFileSync(path,source);
console.log('BALL46_DELIVERY_GUARD_PATCHED');
NODE

npm ci --ignore-scripts --no-audit --no-fund
node --test league-flags-test.mjs
node league-flags-prefix-run.mjs

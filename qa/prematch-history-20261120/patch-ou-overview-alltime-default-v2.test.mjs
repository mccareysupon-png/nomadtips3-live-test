import test from 'node:test';
import assert from 'node:assert/strict';
import {patchOuDefaultAlltimeClient} from './patch-ou-overview-alltime-default-v2-test.mjs';
test('native O/U shows combined ALL TIME by default; explicit Today deep links preserved',()=>{
 const inClient="const B46_OU_ALL_ACCOUNTS_OVERVIEW_V1='B46_OU_ALL_ACCOUNTS_OVERVIEW_V1';\nfunction show(modeNext){\n    const previousMode=mode;\n    if(!previousMode){window.scrollTo(0,0);}\n}";
 const out=patchOuDefaultAlltimeClient(inClient);
 assert(out.includes('B46_OU_ALLTIME_DEFAULT_V2'));
 assert(out.includes("if(modeNext==='ou'&&previousMode!=='ou')"));
 assert(out.includes("if(!(directOu&&(requested==='today'||requested==='all')))statsPeriod='all'"));
 assert.throws(()=>patchOuDefaultAlltimeClient(out),/ALREADY_INSTALLED/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {patchBttsCloneExactOneX2Cards} from './btts-use-exact-1x2-history-cards-20261122.mjs';
const sample="function premiumMatchRow(item,hub,stale){return el('article','b46pm-match b46pm-premium-match');}\n"+
 "function makeBttsCandidateCard(r){ return el('article','b46pm-match b46pm-premium-match b46pm-btts-screen-card')}\n"+
 "function bttsLayoutCssV2(){return 'grid-template-columns:repeat(2,minmax(0,1fr))'}\n"+
 "function makeBttsCandidatesSection(){const result=makeBttsCandidateCard(row);return result;}\n"+
 "const view='b46pm-btts-candidates';";
test('BTTS screening calls exactly the same 1X2 Statistics premium card renderer',()=>{
 const result=patchBttsCloneExactOneX2Cards(sample);
 assert(result.reusesSameCardFunction);
 assert(result.reusesSameCSS);
 assert(result.onlyBttsScreeningUIChanged);
 assert.match(result.code,/const card=premiumMatchRow\(source,null,false\)/);
 assert.match(result.code,/BTTS · SCREENING ONLY/);
 assert.match(result.code,/BET365 · PRICE NEEDED/);
 assert.match(result.code,/BET365 · NOT OFFERED/);
 assert.match(result.code,/function bttsLayoutCssV2\(\)/);
 assert.match(result.code,/display:block!important/);
 assert.doesNotMatch(result.code,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.equal(result.code.split('function premiumMatchRow(item,hub,stale){').length-1,1);
 assert.match(result.code,/function makeBttsCandidatesSection\(\)/);
 assert.throws(()=>patchBttsCloneExactOneX2Cards(result.code),/ALREADY_APPLIED/);
});
test('fail closed if original 1X2 card renderer or existing candidate layout unavailable',()=>{
 assert.throws(()=>patchBttsCloneExactOneX2Cards('function makeBttsCandidateCard(r){}'),
  /EXPECTED_EXISTING/);
});

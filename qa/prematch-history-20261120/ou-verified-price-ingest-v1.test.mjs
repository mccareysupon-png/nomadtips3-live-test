import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOuPriceFromExistingPayload,OUV1_PRICE_POLICY} from './ou-verified-price-ingest-v1-test.mjs';
const now=1800000000,kickoff=now+7200;
const opt={fixtureId:1003,homeId:501,awayId:502,pick:'UNDER_2.5',
  kickoff,observed:now,now,line:2.5};
function response(odds,fixture=1003){
 return {success:1,data:{fixture_id:fixture,bookmakers:[{name:'Bet 365',slug:'bet365',odds}]}};
}
test('official goal_line_fixed 2.5 Bet365 full-price payload accepted',()=>{
 const body=response({goal_line_fixed:[
  {line:1.5,closing:{over:1.22,under:4.1}},
  {line:2.5,opening:{over:1.8,under:2.0},closing:{over:1.85,under:1.95},inplay:{over:2.63,under:1.44}},
  {line:3.5,closing:{over:2.88,under:1.36}}
 ]});
 const out=parseOuPriceFromExistingPayload(body,opt);
 assert.equal(out.state,'PRICED');
 assert.equal(out.selectedPrice,1.95);
 assert.equal(out.priceOver,1.85);
 assert.equal(out.priceUnder,1.95);
 assert.equal(out.source,'BET365_GOAL_LINE_FIXED_CLOSING');
 assert.equal(out.observedAt,now);
 assert.equal(out.providerQuoteTimestamp,null);
 assert.equal(out.providerCalls,0);
 assert.equal(out.estimatedFromOtherMarket,false);
});
test('fallback to main moving goal_line only for EXACT 2.5 full side prices',()=>{
 const x=parseOuPriceFromExistingPayload(response({
   goal_line:{opening:{line:2.75,over:1.7,under:2.1},
     closing:{line:2.5,over:1.91,under:1.89},inplay:{line:3.0,over:2.15,under:1.6}}
 }),{...opt,pick:'OVER_2.5'});
 assert.equal(x.state,'PRICED');
 assert.equal(x.selectedPrice,1.91);
 assert.equal(x.source,'BET365_MAIN_GOAL_LINE_CLOSING');
});
test('never substitute O/U 2.75 or another line',()=>{
 const out=parseOuPriceFromExistingPayload(response({
  goal_line:{closing:{line:2.75,over:1.8,under:2.1}}
 }),opt);
 assert.equal(out.state,'MAIN_GOAL_LINE_MISMATCH');
 assert.equal(out.selectedPrice,null);
});
test('do not use HUB goal_line numeric LINE as odds price',()=>{
 assert.notEqual(parseOuPriceFromExistingPayload({fixture_id:1003,
   providerOdds:{odds:{goal_line:{closing:2.5}}}},opt).state,'PRICED');
 assert.notEqual(parseOuPriceFromExistingPayload(response({
   goal_line:{opening:2.5,closing:2.75,inplay:3}
 }),opt).state,'PRICED');
});
test('null closing fixed 2.5 is withdrawn and never fall back to inplay or moving line',()=>{
 const out=parseOuPriceFromExistingPayload(response({goal_line_fixed:[{line:2.5,
   opening:{over:1.8,under:2.0},closing:null,inplay:{over:1.4,under:2.7}}],
   goal_line:{closing:{line:2.5,over:1.7,under:2.0}}}),opt);
 assert.equal(out.state,'PRICE_WITHDRAWN');
});
test('no 2.5 ladder quote and no matching main line is not offered',()=>{
 const out=parseOuPriceFromExistingPayload(response({goal_line_fixed:[],
   goal_line:{closing:{line:3.0,over:1.9,under:1.9}}}),opt);
 assert.equal(out.state,'MAIN_GOAL_LINE_MISMATCH');
});
test('refuses ambiguous or unidentified bookmaker',()=>{
 const base=response({goal_line_fixed:[{line:2.5,closing:{over:1.85,under:1.95}}]});
 const dup=structuredClone(base);dup.data.bookmakers.push({...dup.data.bookmakers[0]});
 assert.equal(parseOuPriceFromExistingPayload(dup,opt).state,'BET365_NOT_UNIQUELY_IDENTIFIED');
 const other=structuredClone(base);other.data.bookmakers[0]={slug:'pinnacle',odds:other.data.bookmakers[0].odds};
 assert.equal(parseOuPriceFromExistingPayload(other,opt).state,'BET365_NOT_UNIQUELY_IDENTIFIED');
});
test('refuses bad identity, quote timestamps or changed pick line',()=>{
 const odds=response({goal_line_fixed:[{line:2.5,closing:{over:1.85,under:1.95}}]});
 assert.equal(parseOuPriceFromExistingPayload(odds,{...opt,fixtureId:1004}).state,'FIXTURE_ID_MISMATCH');
 assert.equal(parseOuPriceFromExistingPayload(odds,{...opt,observed:kickoff-400,now:kickoff-400}).state,'INVALID_OR_LATE_PRICE_CONTEXT');
 assert.equal(parseOuPriceFromExistingPayload(odds,{...opt,now:kickoff-200}).state,'INVALID_OR_LATE_PRICE_CONTEXT');
 assert.equal(parseOuPriceFromExistingPayload(odds,{...opt,line:2.75}).state,'UNSUPPORTED_OU_SELECTION');
});
test('no string or one-sided pricing permitted',()=>{
 const a=response({goal_line_fixed:[{line:2.5,closing:{over:'1.85',under:1.95}}]});
 const b=response({goal_line_fixed:[{line:2.5,closing:{over:1.85}}]});
 assert.equal(parseOuPriceFromExistingPayload(a,opt).state,'PRICE_NOT_OFFERED');
 assert.equal(parseOuPriceFromExistingPayload(b,opt).state,'PRICE_NOT_OFFERED');
});
test('policy ensures no paid provider calls, no independent backfill',()=>{
 assert.equal(OUV1_PRICE_POLICY.upstreamCalls,0);
 assert.equal(OUV1_PRICE_POLICY.targetLine,2.5);
 assert.equal(OUV1_PRICE_POLICY.minBeforeKickoffSec,900);
});

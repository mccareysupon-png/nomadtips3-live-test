import test from "node:test";
import assert from "node:assert/strict";
import {isGuardedOuMarket,requiredInplayField,strictOuQuote,mainOuTotalPass,verifiedBet365Odds} from "../src/ou-market-integrity.js";
const market=(line,over=1.85,under=1.9)=>({inplay:{line,over,under},opening:{line:0.5,over:1.7,under:2.1},closing:{line:1,over:1.8,under:2}});
const root=()=>({__verifiedBet365:true,corner_line:market(4,1.82,1.92),goal_line:market(3,1.76,2.05),
  corner_line_half:market(2.5,1.85,1.9),goal_line_half:market(1.5,1.87,1.94)});
test("only goals/corners OU markets are guarded (not AH, 1X2 or corners AH)",()=>{
  for(const k of ["ft_over","ft_under","ht_over","ht_under","ft_corner_over","ft_corner_under","ht_corner_over","ht_corner_under"])assert.equal(isGuardedOuMarket(k),true);
  for(const k of ["ft_ah","ft_1x2","ft_corner_ah","ft_cards_over"])assert.equal(isGuardedOuMarket(k),false);
});
test("FT corner quote from exact corner_line.inplay",()=>{
  const q=strictOuQuote(root(),"ft_corner_over","OVER");
  assert.deepEqual(q,{line:4,providerLine:4,odds:1.82});
  assert.equal(requiredInplayField("ft_corner_under"),"corner_line");
});
test("FT goal quote from exact goal_line.inplay, correct UNDER side",()=>{
  assert.deepEqual(strictOuQuote(root(),"ft_under","UNDER"),{line:3,providerLine:3,odds:2.05});
  assert.equal(strictOuQuote(root(),"ft_under","OVER"),null);
});
test("HT markets use their own inplay fields, never FT",()=>{
  assert.equal(strictOuQuote(root(),"ht_corner_over","OVER").line,2.5);
  assert.equal(strictOuQuote(root(),"ht_under","UNDER").line,1.5);
  assert.equal(strictOuQuote({__verifiedBet365:true,corner_line:market(5)},"ht_corner_over","OVER"),null);
});
test("reject stale/even lines: score 1-1 Over 2 and 3 corners Over 3",()=>{
  assert.equal(mainOuTotalPass({line:2},2),false);
  assert.equal(mainOuTotalPass({line:3},3),false);
  assert.equal(mainOuTotalPass({line:1.75},2),false);
  assert.equal(mainOuTotalPass({line:2.25},2),true);
  assert.equal(mainOuTotalPass({line:4},3),true);
});
test("fail closed for unavailable totals or absent bookmaker verification",()=>{
  assert.equal(mainOuTotalPass({line:4},null),false);
  assert.equal(mainOuTotalPass(null,3),false);
  const unverified={corner_line:market(4)};
  assert.equal(strictOuQuote(unverified,"ft_corner_over","OVER"),null);
});
test("no opening, closing, market-alias or fixed ladder fallback",()=>{
  assert.equal(strictOuQuote({__verifiedBet365:true,corner_line:{opening:{line:3,over:1.8},closing:{line:4,over:2}}},"ft_corner_over","OVER"),null);
  assert.equal(strictOuQuote({__verifiedBet365:true,corner:market(4)},"ft_corner_over","OVER"),null);
  assert.equal(strictOuQuote({__verifiedBet365:true,goal_line_fixed:[{line:2.5,inplay:{over:1.8,under:2}}]},"ft_over","OVER"),null);
});
test("reject suspended/unpriced, zero odds and invalid quarter line",()=>{
  const x=root();x.goal_line.inplay={suspended:true,line:3,over:1.8,under:2};
  assert.equal(strictOuQuote(x,"ft_over","OVER"),null);
  x.goal_line.inplay={line:3.3,over:1.8,under:2};
  assert.equal(strictOuQuote(x,"ft_over","OVER"),null);
  x.goal_line.inplay={line:3,over:0,under:2};
  assert.equal(strictOuQuote(x,"ft_over","OVER"),null);
});
test("bookmaker verification requires selected odds object to belong to bet365",()=>{
  const odds={corner_line:market(4)};
  const other={corner_line:market(2)};
  assert.equal(verifiedBet365Odds({data:{bookmakers:[{slug:"pinnacle",odds:other},{slug:"bet365",odds}]}},odds),true);
  assert.equal(verifiedBet365Odds({data:{bookmakers:[{slug:"pinnacle",odds:other}]}},other),false);
  assert.equal(verifiedBet365Odds({data:{odds}},odds),false);
});

import assert from "node:assert/strict";

function once(source, oldText, newText, label) {
  assert.equal(source.split(oldText).length, 2, "JOHN_"+label+"_UNEXPECTED_MATCH");
  return source.replace(oldText, newText);
}
export function patchJohnGoals(source){
  assert(source.includes("JOHN_QUALIFIED_PRICE_CACHE_MISS"),"JOHN_PRICE_CACHE_UNAVAILABLE");
  assert(source.includes("johnQuotesByFixture.get(id)"),"JOHN_PRICE_CACHE_LOOKUP_MISSING");
  assert(source.includes("FULL_MARKET_REQUESTS_PER_SCAN=4"),"REFEREE_BACKOFF_LIMIT_MISSING");
  assert(source.includes("FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;"),"SETTLEMENT_CONTRACT_CHANGED");
  assert(source.includes("var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;"),"CORNERS_CONTRACT_CHANGED");
  assert(!source.includes("/* B46_GOALS_JOHN_RESTORED_20261011 */"),"JOHN_GOALS_ALREADY_RESTORED");
  assert(source.includes("function isVerifiedGoalMarket(key){"),"GOAL_HISTORY_BYPASS_NOT_PRESENT");
  let s=source;
  const startMarker="/* Ball46 GOALS Over Under: Bet365 recorded live goal-line tick; independent from Corners. */";
  const endMarker="function isVerifiedCornerMarket(key){";
  assert.equal(s.split(startMarker).length,2,"GOAL_HELPER_START_NOT_UNIQUE");
  assert.equal(s.split(endMarker).length,2,"CORNERS_HELPER_NOT_UNIQUE");
  const start=s.indexOf(startMarker),end=s.indexOf(endMarker);
  assert(start>=0&&end>start&&end-start<5500,"GOAL_HELPER_BLOCK_UNEXPECTED");
  const removed=s.slice(start,end);
  for(const symbol of ["function isVerifiedGoalMarket(","function goalHistorySpec(","function verifyRecentGoalHistory(","async function fetchVerifiedGoalsOnly("])assert(removed.includes(symbol),"MISSING_GOAL_HELPER_"+symbol);
  s=s.slice(0,start)+"/* B46_GOALS_JOHN_RESTORED_20261011 */\n"+s.slice(end);
  s=once(s, "      let goalTickRequests=0;\n      const goalTickCache=new Map();\n", "", "GOAL_SCAN_CACHE");
  s=once(s, "const requiresFullMarket=marketCandidates.some(c=>!isVerifiedGoalMarket(c.market)&&!isVerifiedCornerMarket(c.market));",
   "const requiresFullMarket=marketCandidates.some(c=>!isVerifiedCornerMarket(c.market));", "JOHN_CACHE_ELIGIBILITY");
  s=once(s, "if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market)||isVerifiedGoalMarket(c.market)))",
   "if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market)))", "GOAL_MUST_HAVE_JOHN_PRICE");
  s=once(s, "if (!full && !isVerifiedCornerMarket(key) && !isVerifiedGoalMarket(key))",
   "if (!full && !isVerifiedCornerMarket(key))", "GOAL_MUST_HAVE_JOHN_PRICE_PER_MARKET");
  const goalPricingStart="                let verifiedGoal=null;";
  const goalPricingEnd="const best = pickBestPriced(cands,verifiedGoal?verifiedGoal.payload:(verifiedCorner?verifiedCorner.payload:full),root,f,settings);";
  assert.equal(s.split(goalPricingStart).length,2,"GOAL_PRICE_BLOCK_START_UNIQUE");
  assert.equal(s.split(goalPricingEnd).length,2,"GOAL_PRICE_BLOCK_END_UNIQUE");
  const bodyStart=s.indexOf(goalPricingStart),bodyEnd=s.indexOf(goalPricingEnd,bodyStart);
  assert(bodyStart>=0&&bodyEnd>bodyStart&&bodyEnd-bodyStart<3500,"GOAL_PRICE_BLOCK_UNEXPECTED");
  const bypass=s.slice(bodyStart,bodyEnd);
  for(const check of ["GOAL_HISTORY_BUDGET","GOAL_LIVE_PRICE_UNVERIFIED","fetchVerifiedGoalsOnly(this.env,id,key,f)"])assert(bypass.includes(check),"GOAL_BYPASS_UNEXPECTED_"+check);
  s=s.slice(0,bodyStart)+
    "                const best = pickBestPriced(cands,verifiedCorner?verifiedCorner.payload:full,root,f,settings);"+
    s.slice(bodyEnd+goalPricingEnd.length);
  const ps='verifiedGoal ? "BET365_VERIFIED_GOALS_HISTORY_INPLAY" : verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY"';
  const pNew='verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY"';
  assert.equal(s.split(ps).length-1,3,"PRICE_SOURCE_COUNT_CHANGED");
  s=s.split(ps).join(pNew);
  const pr='verifiedGoal ? "BET365_RECENT_GOAL_TICK" : verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE"';
  const rNew='verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE"';
  assert.equal(s.split(pr).length-1,2,"PRICE_REF_COUNT_CHANGED");
  s=s.split(pr).join(rNew);
  const leftovers=["isVerifiedGoalMarket(","fetchVerifiedGoalsOnly(","goalTickRequests","goalTickCache","GOAL_HISTORY_BUDGET","GOAL_LIVE_PRICE_UNVERIFIED","BET365_VERIFIED_GOALS_HISTORY_INPLAY","BET365_RECENT_GOAL_TICK"].filter(symbol=>s.includes(symbol));
  assert.equal(leftovers.length,0,"GOAL_HISTORY_REMAINS_"+leftovers.join("|"));
  assert(s.includes("const full=requiresFullMarket?(johnQuotesByFixture.get(id)||null):null;"),"JOHN_CACHE_LOOKUP_CHANGED");
  assert(s.includes("const best = pickBestPriced(cands,verifiedCorner?verifiedCorner.payload:full,root,f,settings);"),"JOHN_PRICING_NOT_RESTORED");
  assert(s.includes("function consensusProviderLine(")&&s.includes("function offersFor(")&&s.includes("function pickBestPriced("),"JOHN_LINE_ODDS_ENGINE_REMOVED");
  assert(s.includes("var BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3;")&&s.includes("var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;"),"CORNERS_CHANGED");
  assert(s.includes("FINAL_RECHECK_MAX_PER_SCAN = 3;")&&s.includes("FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;"),"FT_RECHECK_CHANGED");
  assert(s.includes("FULL_MARKET_REQUESTS_PER_SCAN=4"),"PROVIDER_BACKOFF_GUARD_CHANGED");
  return s;
}

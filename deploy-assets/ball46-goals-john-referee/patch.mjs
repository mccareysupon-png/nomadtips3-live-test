import assert from 'node:assert/strict';

// Narrowest possible production correction: only the four Goals O/U market keys.
// Keep stageValue fallback for every other market untouched.
const ORIGINAL = 'const def = MARKET_RULES[key], stage = stageValue(findMarket(root, def), "inplay");';
const REPLACEMENT = 'const def = MARKET_RULES[key], market = findMarket(root, def), stage = (key === "ft_over" || key === "ft_under" || key === "ht_over" || key === "ht_under") ? (market?.inplay ?? null) : stageValue(market, "inplay");';

export function patchJohnGoals(source) {
  assert(source.includes('function priceFor(root, key, selection)'), 'PRICING_FUNCTION_MISSING');
  assert(source.includes('function consensusProviderLine('), 'LINE_CONSENSUS_MISSING');
  assert(source.includes('function offersFor('), 'MATCHING_LINE_ODDS_MISSING');
  assert(source.includes('function isVerifiedCornerMarket('), 'CORNERS_GUARD_MISSING');
  assert(source.includes('johnQuotesByFixture.get(id)'), 'JOHN_CENTRAL_CACHE_MISSING');
  assert(source.includes('FULL_MARKET_REQUESTS_PER_SCAN=4;'), 'JOHN_RATE_GUARD_MISSING');
  assert(source.includes('FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;'), 'SETTLEMENT_CONTRACT_MISSING');
  assert.equal(source.split(ORIGINAL).length - 1, 1, 'GOALS_STAGE_READ_NOT_UNIQUE');
  assert.equal(source.split(REPLACEMENT).length - 1, 0, 'GOALS_INPLAY_ALREADY_STRICT');
  const candidate = source.replace(ORIGINAL, REPLACEMENT);
  assert.equal(candidate.length - source.length, REPLACEMENT.length - ORIGINAL.length);
  assert.equal(candidate.replace(REPLACEMENT, ORIGINAL), source, 'UNEXPECTED_SOURCE_CHANGE');
  return candidate;
}

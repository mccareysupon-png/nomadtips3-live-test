import assert from 'node:assert/strict';
import { MARKET_KEYS, gapPass, lineGap, settleAh, settleOu } from '../src/market-core.js';

assert.equal(MARKET_KEYS.length,18);
assert.equal(lineGap(4.5,4),0.5);
assert.equal(gapPass(4.5,4,0.5),true);
assert.equal(gapPass(4.75,4,0.5),false);
assert.equal(settleOu(5,4.5,'OVER'),'WIN');
assert.equal(settleOu(5,4.75,'OVER'),'HALF_WIN');
assert.equal(settleOu(4,4.25,'UNDER'),'HALF_WIN');
assert.equal(settleAh(2,1,-0.5,'HOME'),'WIN');
assert.equal(settleAh(2,1,-1,'HOME'),'PUSH');
assert.equal(settleAh(2,1,0.5,'AWAY'),'LOSS');
console.log('market-core ok');

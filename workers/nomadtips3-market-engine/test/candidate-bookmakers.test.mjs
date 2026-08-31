import assert from 'node:assert/strict';
import { canonicalBookmaker, bookmakerWeight } from '../src/normalize.js';

assert.equal(canonicalBookmaker('FUN88'), 'FUN88');
assert.equal(canonicalBookmaker('fun 88'), 'FUN88');
assert.equal(canonicalBookmaker('M88'), 'M88');
assert.equal(canonicalBookmaker('m-88'), 'M88');
assert.equal(bookmakerWeight('FUN88'), 1);
assert.equal(bookmakerWeight('M88'), 1);

console.log('candidate bookmaker aliases: OK');

import assert from 'node:assert/strict';
import { activeVersion } from './production.mjs';
const EXPECTED='b147a833-2e30-4ea4-8899-25c80eac254c';
assert.equal(await activeVersion(),EXPECTED,'PRODUCTION_MOVED_SINCE_READ_ONLY_SCOUT_STOP');
console.log(`LOCKED_PRODUCTION_BASE=${EXPECTED}`);
await import('./card-signal-more-run.mjs');

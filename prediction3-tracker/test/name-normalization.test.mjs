import assert from 'node:assert/strict';
import {foldLatin,tokens,teamScore} from '../src/index.js';

assert.equal(foldLatin('Wisła Płock'),'Wisla Plock');
assert.deepEqual(tokens('Wisła Płock'),['wisla','plock']);
assert.deepEqual(tokens('Wisla Plock'),['wisla','plock']);
assert.equal(teamScore('Wisła Płock','Wisla Plock'),1);
assert.equal(teamScore('Pogoń Szczecin','Pogon Szczecin'),1);
assert.equal(teamScore('Djurgården','Djurgarden'),1);
assert.equal(teamScore('Sønderjyske','Sonderjyske'),1);

console.log('Prediction3 name normalization regression test: PASS');

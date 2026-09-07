import assert from 'node:assert/strict';
import {foldLatin,tokens,teamScore,fixtureFor,finalFallbackEligible,sanitizeExisting} from '../src/index.js';

assert.equal(foldLatin('Wisła Płock'),'Wisla Plock');
assert.deepEqual(tokens('Wisła Płock'),['wisla','plock']);
assert.deepEqual(tokens('Wisla Plock'),['wisla','plock']);
assert.equal(teamScore('Wisła Płock','Wisla Plock'),1);
assert.equal(teamScore('Pogoń Szczecin','Pogon Szczecin'),1);
assert.equal(teamScore('Djurgården','Djurgarden'),1);
assert.equal(teamScore('Sønderjyske','Sonderjyske'),1);

// Generic Arabic club prefix must never be enough to match two unrelated teams.
assert.deepEqual(tokens('Al-Ettifaq'),['ettifaq']);
assert.deepEqual(tokens('Al-Faisaly'),['faisaly']);
assert.equal(teamScore('Al-Ettifaq','Al-Hilal'),0);
assert.equal(teamScore('Al-Faisaly','Al-Nassr'),0);

const kickoff='2026-09-08T15:30:00Z';
const item={
  id:'p3-2026-09-08-ett-fai',
  home:'Al-Ettifaq',
  away:'Al-Faisaly',
  tracking:{kickoffUtc:kickoff,fixtureId:null},
};
const exactFinal={id:'fixture-ett-fai',home:'Al-Ettifaq',away:'Al-Faisaly',status:'FT',score:[2,0]};
const wrongFinal={id:'fixture-hil-nas',home:'Al-Hilal',away:'Al-Nassr',status:'FT',score:[2,0]};
const kickoffMs=Date.parse(kickoff);

// Before the scheduled match can plausibly be over, name fallback must not settle anything.
assert.equal(finalFallbackEligible(item,kickoffMs+30*60*1000),false);
assert.equal(fixtureFor(item,[exactFinal],{final:true,at:kickoffMs+30*60*1000}),null);
assert.equal(fixtureFor(item,[wrongFinal],{final:true,at:kickoffMs+3*60*60*1000}),null);

// After the safety window, strict home+away names can recover a final if no fixture id was captured.
assert.equal(finalFallbackEligible(item,kickoffMs+2*60*60*1000),true);
assert.equal(fixtureFor(item,[exactFinal],{final:true,at:kickoffMs+2*60*60*1000})?.id,'fixture-ett-fai');

// A fixture id learned while LIVE is authoritative and does not depend on fuzzy names.
assert.equal(fixtureFor(item,[exactFinal],{knownFixtureId:'fixture-ett-fai',final:true,at:kickoffMs})?.id,'fixture-ett-fai');

// Heal any impossible FT/LOSS that was written before the scheduled match could finish.
const badExisting={fixtureId:'wrong-fixture',status:'FT',score:[0,1],result:'LOSS',settledAt:'2026-09-08T06:00:00Z',actual:'away'};
const healed=sanitizeExisting(item,badExisting,kickoffMs+30*60*1000);
assert.equal(healed.status,'SCHEDULED');
assert.equal(healed.result,null);
assert.equal(healed.fixtureId,null);
assert.equal(healed.score,null);

console.log('Prediction3 name + fixture matching regression test: PASS');

import assert from 'node:assert/strict';
import {foldLatin,tokens,teamScore,fixtureFor,finalFallbackEligible,sanitizeExisting,settleMarket} from '../src/index.js';

assert.equal(foldLatin('Wisła Płock'),'Wisla Plock');
assert.deepEqual(tokens('Wisła Płock'),['wisla','plock']);
assert.deepEqual(tokens('Wisla Plock'),['wisla','plock']);
assert.equal(teamScore('Wisła Płock','Wisla Plock'),1);
assert.equal(teamScore('Pogoń Szczecin','Pogon Szczecin'),1);
assert.equal(teamScore('Djurgården','Djurgarden'),1);
assert.equal(teamScore('Sønderjyske','Sonderjyske'),1);

// International display names must still match common provider aliases.
assert.equal(teamScore('AGF Aarhus','Aarhus'),1);
assert.equal(teamScore('Como 1907','Como'),1);
assert.equal(teamScore('Parma Calcio 1913','Parma'),1);
assert.equal(teamScore('FC Nordsjælland','Nordsjaelland'),1);

// Generic Arabic club prefix must never be enough to match two unrelated teams.
assert.deepEqual(tokens('Al-Ettifaq'),['ettifaq']);
assert.deepEqual(tokens('Al-Faisaly'),['faisaly']);
assert.equal(teamScore('Al-Ettifaq','Al-Hilal'),0);
assert.equal(teamScore('Al-Faisaly','Al-Nassr'),0);
assert.ok(teamScore('Manchester City','Manchester United')<0.75);

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

// A fixture id learned while LIVE is authoritative only when the team identity still agrees.
assert.equal(fixtureFor(item,[exactFinal],{knownFixtureId:'fixture-ett-fai',final:true,at:kickoffMs})?.id,'fixture-ett-fai');
assert.equal(fixtureFor({...item,tracking:{...item.tracking,fixtureId:'fixture-hil-nas'}},[wrongFinal],{final:true,at:kickoffMs})?.id,undefined);

// Provider aliases used by the 13 September winner must resolve to the international display names.
const fcnKickoff=Date.parse('2026-09-13T11:00:00Z');
const fcnItem={home:'FC Nordsjælland',away:'AGF Aarhus',tracking:{kickoffUtc:'2026-09-13T11:00:00Z',fixtureId:null}};
const fcnFinal={id:'fixture-fcn-agf',home:'Nordsjaelland',away:'Aarhus',status:'FT',score:[2,0]};
assert.equal(fixtureFor(fcnItem,[fcnFinal],{final:true,at:fcnKickoff+2*60*60*1000})?.id,'fixture-fcn-agf');

// Current supported Sirius markets must settle deterministically from final score.
assert.equal(settleMarket({market:'BTTS',selection:'no',pick:'BTTS No'},[2,0])?.result,'WIN');
assert.equal(settleMarket({market:'BTTS',selection:'no',pick:'BTTS No'},[2,1])?.result,'LOSS');
const comoPick={home:'Como 1907',away:'Parma Calcio',market:'AH',line:-1.5,tracking:{pickSide:'home'}};
assert.equal(settleMarket(comoPick,[2,0])?.result,'WIN');
assert.equal(settleMarket(comoPick,[1,0])?.result,'LOSS');

// Heal any impossible FT/LOSS that was written before the scheduled match could finish.
const badExisting={fixtureId:'wrong-fixture',status:'FT',score:[0,1],result:'LOSS',settledAt:'2026-09-08T06:00:00Z',actual:'away'};
const healed=sanitizeExisting(item,badExisting,kickoffMs+30*60*1000);
assert.equal(healed.status,'SCHEDULED');
assert.equal(healed.result,null);
assert.equal(healed.fixtureId,null);
assert.equal(healed.score,null);

console.log('Prediction3 international name + automatic settlement regression test: PASS');

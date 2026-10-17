import test from "node:test";
import assert from "node:assert/strict";
import {ingestFixtures,proposeMappings} from "../fixture-registry.mjs";

const now="2026-10-17T12:30:00Z";
const fixture=(id="B46-1",sourceId="5D-11",extras={})=>({
 fixtureId:id, sourceFixtureId:sourceId,home:"Alpha FC",away:"Beta United",
 league:"League One",kickoffUtc:"2026-10-17T11:00:00Z",...extras
});
const capture=(snapshots,existing=[])=>ingestFixtures({existing,snapshots,collectedAt:now});
const policy={goaloo:{utcCertified:true,regulationFtCertified:true},third:{utcCertified:true,regulationFtCertified:true}};
const claim=(source="goaloo",sourceFixtureId="G-22",extra={})=>({
 source,sourceFixtureId,home:"Alpha FC",away:"Beta United",league:"League One",
 kickoffUtc:"2026-10-17T11:00:00Z",...extra
});
const map=(r,claims,extras={})=>proposeMappings({registry:r.records,claims,policies:policy,...extras});

test("canonical fixture stored with source ID and kickoff UTC",()=>{
 const r=capture([fixture()]);
 assert.equal(r.audit[0].reason,"NEW_CANONICAL_FIXTURE");
 assert.equal(r.records[0].sourceIds["5usd"],"5D-11");
 assert.equal(r.records[0].kickoffUtc,"2026-10-17T11:00:00.000Z");
 assert.equal(r.writes,0);
});
test("strict full ID required, not inferred from Ball46 fixture ID",()=>{
 const r=capture([fixture("B46-1","")]);
 assert.equal(r.records.length,0);assert.equal(r.audit[0].reason,"PRIMARY_SOURCE_ID_UNVERIFIED");
});
test("missing kickoff timezone is rejected",()=>{
 const r=capture([fixture("B46-1","5D-11",{kickoffUtc:"2026-10-17 11:00:00"})]);
 assert.equal(r.audit[0].reason,"CANONICAL_IDENTITY_INCOMPLETE");
});
test("existing immutable fixture preserves ID, earlier firstSeen and source mappings",()=>{
 const a=capture([fixture()]);
 const b=capture([fixture()],a.records);
 assert.equal(b.records.length,1);
 assert.equal(b.records[0].firstSeenAt,now);
 assert.equal(b.audit[0].reason,"UNCHANGED_IDENTITY");
});
test("canonical kickoff modification rejected",()=>{
 const a=capture([fixture()]), b=capture([fixture("B46-1","5D-11",{kickoffUtc:"2026-10-17T11:10:00Z"})],a.records);
 assert.equal(b.audit[0].reason,"IMMUTABLE_FIXTURE_IDENTITY_CONFLICT");
 assert.equal(b.records[0].kickoffUtc,a.records[0].kickoffUtc);
});
test("canonical home-away swap rejected",()=>{
 const a=capture([fixture()]),b=capture([fixture("B46-1","5D-11",{home:"Beta United",away:"Alpha FC"})],a.records);
 assert.equal(b.audit[0].reason,"IMMUTABLE_FIXTURE_IDENTITY_CONFLICT");
});
test("canonical primary source ID conflict rejected",()=>{
 const a=capture([fixture()]),b=capture([fixture("B46-1","DIFFERENT")],a.records);
 assert.equal(b.audit[0].reason,"PRIMARY_SOURCE_ID_CONFLICT");
});
test("different canonical fixtures cannot share primary provider id in a batch",()=>{
 const r=capture([fixture(),fixture("B46-2","5D-11",{home:"Gamma FC",away:"Delta FC"})]);
 assert.equal(r.audit[1].reason,"DUPLICATE_PRIMARY_PROVIDER_ID");
});
test("Goaloo maps only after explicit timezone and FT policy certification",()=>{
 const r=capture([fixture()]);const result=proposeMappings({registry:r.records,claims:[claim()]});
 assert.equal(result.audit[0].reason,"SOURCE_POLICY_OR_ID_NOT_CERTIFIED");
 assert.equal(result.records[0].sourceIds.goaloo,undefined);
});
test("Goaloo first approved mapping is stored with independent source ID",()=>{
 const r=map(capture([fixture()]),[claim()]);
 assert.equal(r.records[0].sourceIds.goaloo,"G-22");
 assert.equal(r.audit[0].reason,"MAPPING_VERIFIED");
});
test("third source plugs in without touching first two mappings",()=>{
 const a=map(capture([fixture()]),[claim()]);
 const b=proposeMappings({registry:a.records,claims:[claim("third","T-33")],policies:policy});
 assert.equal(b.records[0].sourceIds["5usd"],"5D-11");
 assert.equal(b.records[0].sourceIds.goaloo,"G-22");
 assert.equal(b.records[0].sourceIds.third,"T-33");
 assert.equal(b.writes,0);
});
test("swapped team mapping rejected",()=>{
 const r=map(capture([fixture()]),[claim("goaloo","G-22",{home:"Beta United",away:"Alpha FC"})]);
 assert.equal(r.audit[0].reason,"NO_VERIFIED_CANONICAL_MATCH");
});
test("wrong league rejected unless explicitly approved alias",()=>{
 const f=capture([fixture()]);
 const c=claim("goaloo","G-22",{league:"Goaloo League Name"});
 const a=map(f,[c]);
 assert.equal(a.audit[0].reason,"NO_VERIFIED_CANONICAL_MATCH");
 const b=map(f,[c],{leagueAliases:{goaloo:{"goaloo league name":"League One"}}});
 assert.equal(b.audit[0].reason,"MAPPING_VERIFIED");
});
test("source id cannot be changed after mapping",()=>{
 const a=map(capture([fixture()]),[claim()]);
 const b=proposeMappings({registry:a.records,claims:[claim("goaloo","G-DIFFERENT")],policies:policy});
 assert.equal(b.audit[0].reason,"MAPPING_ALREADY_LOCKED_TO_DIFFERENT_SOURCE_ID");
 assert.equal(b.records[0].sourceIds.goaloo,"G-22");
});
test("goaloo new ID cannot be assigned to another canonical fixture",()=>{
 const r=capture([fixture(),fixture("B46-2","5D-12",{home:"Gamma FC",away:"Delta FC"})]);
 const claims=[claim("goaloo","G-22"),claim("goaloo","G-22",{home:"Gamma FC",away:"Delta FC"})];
 const b=map(r,claims);
 assert.equal(b.audit[1].reason,"PROVIDER_ID_ALREADY_ASSIGNED");
});
test("ambiguous same-team and kickoff match is rejected instead of guessing",()=>{
 const r=capture([fixture(),fixture("B46-2","5D-12")]);
 const b=map(r,[claim()]);
 assert.equal(b.audit[0].reason,"AMBIGUOUS_FIXTURE_MATCH");
});
test("mapping beyond UTC kickoff tolerance rejected",()=>{
 const r=map(capture([fixture()]),[claim("goaloo","G-22",{kickoffUtc:"2026-10-17T11:40:00Z"})]);
 assert.equal(r.audit[0].reason,"NO_VERIFIED_CANONICAL_MATCH");
});
test("mapping with unknown source timezone rejected",()=>{
 const r=map(capture([fixture()]),[claim("goaloo","G-22",{kickoffUtc:"2026-10-17 11:00:00"})]);
 assert.equal(r.audit[0].reason,"SOURCE_IDENTITY_INCOMPLETE");
});
test("no mutation to input registry",()=>{
 const a=capture([fixture()]);const orig=JSON.stringify(a.records);
 map(a,[claim()]);assert.equal(JSON.stringify(a.records),orig);
});

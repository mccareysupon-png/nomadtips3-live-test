import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestLeagueAliases} from '../league-alias-suggestions.mjs';
const canonical=[
 {fixtureId:'5D-1',home:'Bangkok United',away:'Buriram United',league:'Thai League 1',kickoffUtc:'2026-10-18T12:00:00Z'},
 {fixtureId:'5D-2',home:'Chiangrai United',away:'Port FC',league:'Thai League 1',kickoffUtc:'2026-10-18T11:00:00Z'}
];
const source=[
 {sourceFixtureId:'G-100',home:'Bangkok Utd',away:'Buriram Utd',league:'Thailand Premier League',kickoffUtc:'2026-10-18T12:03:00Z'},
 {sourceFixtureId:'G-200',home:'Chiangrai Utd',away:'Port FC',league:'Thailand Premier League',kickoffUtc:'2026-10-18T11:05:00Z'}
];
test('learning mode suggests alias from two unique games, never auto-accepts',()=>{
 const x=suggestLeagueAliases(canonical,source,{sourceUtcCertified:true});
 assert.equal(x.suggestions.length,1);
 assert.equal(x.suggestions[0].distinctMatches,2);
 assert.equal(x.suggestions[0].state,'REVIEW_REQUIRED');
 assert.equal(x.suggestions[0].autoAccepted,false);
 assert.equal(x.writes,0);
});
test('no certification means no candidate alias',()=>{
 const x=suggestLeagueAliases(canonical,source);
 assert.equal(x.suggestions.length,0);
 assert.equal(x.reason,'SOURCE_UTC_NOT_CERTIFIED');
});
test('one game does not establish a league translation',()=>{
 const x=suggestLeagueAliases(canonical,source.slice(0,1),{sourceUtcCertified:true});
 assert.equal(x.suggestions.length,0);
});
test('name-only coincidence without matching kickoff does not suggest alias',()=>{
 const x=suggestLeagueAliases(canonical,source.map(f=>({...f,kickoffUtc:'2026-10-19T11:00:00Z'})),
 {sourceUtcCertified:true});
 assert.equal(x.suggestions.length,0);
});
test('two source fixtures claiming same canonical game make proposal ambiguous',()=>{
 const duplicate={...source[0],sourceFixtureId:'G-OTHER'};
 const x=suggestLeagueAliases(canonical,[...source,duplicate],{sourceUtcCertified:true});
 assert.equal(x.suggestions.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyCornerMarket} from '../src/corner-market.js';
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const member=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
test('5USD corner_line is total O/U, not proven Asian or standard',()=>{
 const x=classifyCornerMarket({providerMarket:'corner_line',selection:'OVER',line:3.5});
 assert.equal(x.type,'TOTAL_OU');assert.match(x.reason,/unconfirmed/);
});
test('5USD corner_asian is corner handicap',()=>{
 assert.equal(classifyCornerMarket({providerMarket:'corner_asian'}).type,'CORNER_HANDICAP');
});
test('Explicit Asian and standard total labels are distinct',()=>{
 assert.equal(classifyCornerMarket({marketLabel:'Asian Total Corners',selection:'OVER'}).type,'ASIAN_TOTAL');
 assert.equal(classifyCornerMarket({marketLabel:'Standard Total Corners'}).type,'STANDARD_TOTAL');
});
test('Quarters and halves cannot prove Asian source',()=>{
 for(const line of [3.5,3.75,4,4.25,5.5])
  assert.equal(classifyCornerMarket({market:'FT_CORNERS',line}).type,'UNVERIFIED');
});
test('Different categories and conflicts are not accepted as Asian total',()=>{
 assert.equal(classifyCornerMarket({marketLabel:'Team Corners Over/Under'}).type,'TEAM_CORNERS');
 assert.equal(classifyCornerMarket({providerMarket:'corner_asian',marketLabel:'Asian Total Corners',selection:'OVER'}).type,'CONFLICT');
});
test('Member shows market provenance while Engine remains untouched',()=>{
 assert.match(worker,/cornerMarket:category==='CORNERS'\?classifyCornerMarket/);
 assert.match(member,/function renderCornerAudit\(/);
 assert.match(html,/id="cornerMarketAudit"/);
});

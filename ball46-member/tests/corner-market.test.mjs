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


test('Engine rule keys preserve distinct Total O/U and Corner Handicap contracts',async()=>{
 const {cornerRuleForSignal}=await import('../src/corner-conditions.js');
 for(const [key,family,route] of [
  ['ft_corner_over','TOTAL_OU','corner_line → corner'],
  ['ft_corner_under','TOTAL_OU','corner_line → corner'],
  ['ht_corner_over','TOTAL_OU','corner_line_half → corner_half'],
  ['ht_corner_under','TOTAL_OU','corner_line_half → corner_half'],
  ['ft_corner_ah','CORNER_HANDICAP','corner_asian']]){
  const rule=cornerRuleForSignal({market:key});
  assert.equal(rule.key,key);assert.equal(rule.family,family);assert.equal(rule.marketRoute,route);
 }
});
test('Unrecognized Corner signal rule is never guessed from 3.5, 3.75 or price',async()=>{
 const {cornerRuleForSignal}=await import('../src/corner-conditions.js');
 assert.equal(cornerRuleForSignal({market:'corners',line:3.5,odds:2.1}).family,'UNVERIFIED');
 assert.equal(cornerRuleForSignal({market:'ft_corner_asian_total',line:3.75}).family,'UNVERIFIED');
});
test('Member card connects recorded rule, odds, provider, price source and entry data',()=>{
 assert.match(worker,/cornerRule:category==='CORNERS'\?cornerRuleForSignal\(row\):null/);
 assert.match(worker,/lineGap:num\(row\?\.lineGap\)/);
 assert.match(worker,/priceSource:String\(row\?\.priceSource/);
 assert.match(member,/function cornerRuleCard\(row\)/);
 assert.match(member,/if\(selected.market==='CORNERS'\)signal.append\(cornerRuleCard\(selected\)\)/);
 assert.match(member,/PROVIDER MARKET/);
 assert.match(member,/CONFIGURED ROUTE/);
 assert.match(member,/These are recorded signal-entry conditions, not a live bookmaker quote/);
 assert.match(member,/CORNER AH = team versus team corner difference/);
 assert.match(member,/Provider market\/route do NOT prove the Bet365 menu is Asian Total or Standard Total/);
 assert.match(member,/cornerRuleName\(s\)/);
});

import assert from 'node:assert/strict';
import {normalizeTeamName,teamSimilarity,mapGoalooToOddsEvents,parseAsianHandicap} from './worker/src/real-market.js';
assert.equal(normalizeTeamName('Brentford FC'),'brentford');
assert.ok(teamSimilarity('Manchester Utd','Manchester United')>=0.6);
const mapped=mapGoalooToOddsEvents([{sourceMatchId:'g1',home:'Brentford FC',away:'Manchester United',league:'Premier League',kickoffUtc:'2025-09-27T11:30:00Z'}],[{id:61300607,home:'Brentford FC',away:'Manchester United',date:'2025-09-27T11:30:00Z',league:{name:'Premier League'}}]);
assert.equal(mapped[0].event.id,61300607);
const ah=parseAsianHandicap({bookmakers:{'1xbet':[{name:'Spread',updatedAt:'2025-09-22T13:21:42Z',odds:[{hdp:1,home:'1.440',away:'2.960'}]}]}});
assert.deepEqual({line:ah.line,home:ah.home,away:ah.away},{line:1,home:1.44,away:2.96});

const multi={bookmakers:{'1xbet':[{name:'Spread',updatedAt:'2025-09-22T13:21:42Z',odds:[
  {hdp:-0.5,home:'1.91',away:'1.91'},
  {hdp:-1,home:'2.20',away:'1.70'},
  {hdp:-1.25,home:'2.55',away:'1.52'}
]}]}};
const homeMinusOne=parseAsianHandicap(multi,'1xbet',{side:'HOME',ahMin:-1,ahMax:-1,oddsMin:1.7,oddsMax:2.5});
assert.deepEqual({line:homeMinusOne.line,home:homeMinusOne.home,away:homeMinusOne.away,matchedPreference:homeMinusOne.matchedPreference,matchedOdds:homeMinusOne.matchedOdds},{line:-1,home:2.2,away:1.7,matchedPreference:true,matchedOdds:true});
const awayPlusOne=parseAsianHandicap(multi,'1xbet',{side:'AWAY',ahMin:1,ahMax:1,oddsMin:1.5,oddsMax:2});
assert.deepEqual({line:awayPlusOne.line,away:awayPlusOne.away,matchedPreference:awayPlusOne.matchedPreference},{line:-1,away:1.7,matchedPreference:true});
console.log('real-market tests PASS');

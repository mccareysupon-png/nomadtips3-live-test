import test from 'node:test';
import assert from 'node:assert/strict';
import {mapMatchesToOddsEvents,parseAsianHandicap,marketUpdatedAtMs,teamSimilarity} from '../src/real-market.js';

test('match mapper pairs TotalCorner teams to the Odds-API.io live event',()=>{
  const matches=[{id:'tc-1',league:'India Sikkim S-League',home:'Sikkim Brotherhood FC',away:'Northerners FC'}];
  const events=[
    {id:'wrong',home:'Other Home',away:'Other Away',league:{name:'Other League'}},
    {id:'odds-1',home:'Sikkim Brotherhood',away:'Northerners',league:{name:'Sikkim S-League'}},
  ];
  const [mapped]=mapMatchesToOddsEvents(matches,events);
  assert.equal(mapped.event.id,'odds-1');
  assert.ok(mapped.matchConfidence>=0.70);
  assert.ok(teamSimilarity('Sikkim Brotherhood FC','Sikkim Brotherhood')>=0.94);
});

test('1xBet Spread is converted to HOME live AH market data',()=>{
  const payload={
    id:'odds-1',
    bookmakers:{
      '1xbet':[
        {name:'Spread',updatedAt:'2026-08-21T07:00:00Z',odds:[
          {hdp:-0.5,home:1.82,away:1.96},
          {hdp:-0.25,home:1.66,away:2.12},
        ]},
      ],
    },
  };
  const ah=parseAsianHandicap(payload,'1xbet',{allowedLines:[-0.5],oddsMin:1.5,oddsMax:null});
  assert.equal(ah.line,-0.5);
  assert.equal(ah.home,1.82);
  assert.equal(ah.bookmaker,'1xbet');
  assert.equal(marketUpdatedAtMs(ah),Date.parse('2026-08-21T07:00:00Z'));
});

test('configured HOME line is preferred over another available spread line',()=>{
  const payload={bookmakers:{'1xbet':[{name:'Spread',updatedAt:'2026-08-21T07:00:00Z',odds:[
    {hdp:0,home:1.91,away:1.91},
    {hdp:1,home:1.55,away:2.30},
  ]}]}};
  assert.equal(parseAsianHandicap(payload,'1xbet',{allowedLines:[1],oddsMin:1.5}).line,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketPredictions, settleMarket} from './market_helpers.mjs';

function baseMatch(asianLine){
  return {
    home:'Home', away:'Away', pick:'Home', pickSide:'home', odds:1.90, confidence:60, status:'PENDING',
    analysis:{homeVenue:{gfpg:1.5,gapg:1.0},awayVenue:{gfpg:1.0,gapg:1.5}},
    context:{market:{current:{oneX2:{home:1.9,draw:3.4,away:4.0},asian:{home:1.91,line:asianLine,away:1.95}}}}
  };
}

test('Goaloo AH line keeps HOME perspective and inverts only AWAY',()=>{
  const neg=buildMarketPredictions(baseMatch('-1'));
  assert.equal(neg.ah.lineRaw,'-1');
  if(neg.ah.side==='home') assert.equal(neg.ah.handicap,-1);
  else assert.equal(neg.ah.handicap,1);

  const pos=buildMarketPredictions(baseMatch('+1'));
  assert.equal(pos.ah.lineRaw,'+1');
  if(pos.ah.side==='home') assert.equal(pos.ah.handicap,1);
  else assert.equal(pos.ah.handicap,-1);
});

test('prematch AH settlement uses selected-team full-match perspective',()=>{
  assert.equal(settleMarket({key:'AH',side:'home',handicap:1},0,1),'PUSH');
  assert.equal(settleMarket({key:'AH',side:'away',handicap:1},1,0),'PUSH');
});

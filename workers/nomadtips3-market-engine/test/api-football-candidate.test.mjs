import assert from 'node:assert/strict';
import {matchFixture,parseCandidateOdds} from '../src/api-football-candidate.js';

const fixture=matchFixture(
  {home:'Manchester United',away:'Arsenal',minute:67,score:[1,1]},
  [
    {id:'10',home:'Manchester City',away:'Arsenal',minute:67,score:[1,1],league:'Test'},
    {id:'11',home:'Manchester United FC',away:'Arsenal FC',minute:66,score:[1,1],league:'Test'},
  ],
);
assert.equal(fixture?.id,'11');

const parsed=parseCandidateOdds([{
  teams:{home:{name:'Manchester United'},away:{name:'Arsenal'}},
  bookmaker:{name:'Bet365'},
  odds:[
    {name:'Match Winner',values:[
      {value:'Home',odd:'2.10',main:true},
      {value:'Draw',odd:'3.20',main:true},
      {value:'Away',odd:'3.50',main:true},
    ]},
    {name:'Over/Under',values:[
      {value:'Over 2.5',odd:'1.88',main:true},
      {value:'Under 2.5',odd:'1.96',main:true},
    ]},
  ],
}]);

assert.deepEqual(
  {home:parsed.oneXtwo?.home,draw:parsed.oneXtwo?.draw,away:parsed.oneXtwo?.away},
  {home:2.1,draw:3.2,away:3.5},
);
assert.equal(parsed.totals?.line,2.5);
assert.equal(parsed.totals?.over,1.88);
assert.equal(parsed.totals?.under,1.96);
console.log('api-football candidate adapter tests passed');

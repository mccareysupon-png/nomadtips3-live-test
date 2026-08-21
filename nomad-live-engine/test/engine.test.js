import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToday,parseLiveDetail,parseBet365Asian} from '../src/parser.js';
import {DEFAULT_CONFIG,validateEditableConfig} from '../src/config.js';
import {evaluate} from '../src/detector.js';
import {settleAsian} from '../src/settlement.js';

test('today parser extracts live row',()=>{
  const html=`<table><tr><td><a href="/league/china">China FA Cup</a></td><td>12:00</td><td>72</td><td><a href="/team/view/1">Home FC</a></td><td>1 - 1</td><td><a href="/team/view/2">Away FC</a></td><td>-0.5 (-0.25)</td><td>7 - 4 (3-2)</td><td>10.0</td><td>3.0</td><td>61 - 39</td><td><a href="/stats/home-fc-vs-away-fc/198290122">Stats</a><a href="/odds/home-fc-vs-away-fc/198290122">Odds</a><a href="/live/home-fc-vs-away-fc/198290122">Live</a></td></tr></table>`;
  const [m]=parseToday(html);
  assert.equal(m.id,'198290122'); assert.equal(m.home,'Home FC'); assert.equal(m.minute,72);
  assert.deepEqual(m.score,{home:1,away:1}); assert.deepEqual(m.corner,{home:7,away:4}); assert.deepEqual(m.dangerousAttack,{home:61,away:39});
});

test('stats parser reads TotalCorner live-event layout',()=>{
  const x=parseLiveDetail(`<div>Live Events Status: 72 ' , Score: 1 - 1 , Corner: 7 - 4 5 Shoot on target 2 12 Shoot off target 7 122 Attack 75 61 Dangerous Attack 39 56 Possession % 44 * * * Score: 0 - 0 , Corner: 3 - 2 Half</div>`);
  assert.deepEqual(x.attacks,{home:122,away:75}); assert.deepEqual(x.shotsOn,{home:5,away:2}); assert.deepEqual(x.possession,{home:56,away:44}); assert.deepEqual(x.corners,{home:7,away:4}); assert.equal(x.minute,72);
});

test('Bet365 Asian parser chooses inplay triple',()=>{
  const x=parseBet365Asian(`<div>cover rates Full Half Pre-match Inplay Home Line Away Home Line Away Bet 365 1.98 -0.5 1.83 1.80 -0.5 2.00 Pinnacle 1.90 -0.5 1.90</div>`);
  assert.deepEqual(x,{homeOdds:1.8,line:-0.5,awayOdds:2,bookmaker:'Bet365'});
});

test('Bet365 Asian parser normalizes split inplay handicap',()=>{
  const x=parseBet365Asian(`<div>cover rates Full Half Pre-match Inplay Home Line Away Home Line Away Bet365 1.85 0.0, -0.5 1.95 2.00 -0.5, -1.0 1.80</div>`);
  assert.deepEqual(x,{homeOdds:2,line:-0.75,awayOdds:1.8,bookmaker:'Bet365'});
});

test('detector signals when the configured evidence count and other gates pass',()=>{
  const m={minute:70,score:{home:1,away:1},stats:{attacks:{home:120,away:80},dangerousAttack:{home:60,away:35},shotsOn:{home:6,away:2},shotsOff:{home:10,away:5},corners:{home:7,away:3},possession:{home:58,away:42}}};
  const d=evaluate(m,DEFAULT_CONFIG,{line:-.5,homeOdds:1.91,awayOdds:1.95});
  assert.equal(d.side,'home'); assert.equal(d.state,'SIGNAL'); assert.equal(d.passed,5); assert.equal(d.evidence.required,1); assert.ok(d.evidence.passedCount>=1);
});

test('evidence required accepts 1 2 3 or ALL',()=>{
  for(const value of [1,2,3,'ALL']){
    const r=validateEditableConfig({attackEvidenceEnabled:true,evidenceRequired:value});
    assert.equal(r.ok,true); assert.equal(r.config.evidenceRequired,value);
  }
});

test('runtime config accepts ALL for both scan limits',()=>{
  const r=validateEditableConfig({minuteFrom:50,minuteTo:86,maxScoreDifference:4,momentumMinimum:64,allowedSelectionLines:'0,-0.25,-0.5,0.25',oddsMinimum:1.55,oddsMaximum:2.4,maxWatchMatches:'ALL',maxNearOddsMatches:'ALL'});
  assert.equal(r.ok,true); assert.equal(r.config.maxScoreDifference,4); assert.equal(r.config.maxWatchMatches,0); assert.equal(r.config.maxNearOddsMatches,0); assert.deepEqual(r.config.allowedSelectionLines,[0,-0.25,-0.5,0.25]);
});

test('runtime config still accepts finite scan limits',()=>{
  const r=validateEditableConfig({maxWatchMatches:300,maxNearOddsMatches:120});
  assert.equal(r.ok,true); assert.equal(r.config.maxWatchMatches,300); assert.equal(r.config.maxNearOddsMatches,120);
});

test('runtime config rejects invalid ranges',()=>{
  const r=validateEditableConfig({minuteFrom:90,minuteTo:60,oddsMinimum:2.5,oddsMaximum:1.5,maxWatchMatches:5,maxNearOddsMatches:9});
  assert.equal(r.ok,false); assert.ok(r.errors.length>=3);
});

test('ALL defaults remove scan caps',()=>{
  assert.equal(DEFAULT_CONFIG.maxWatchMatches,0); assert.equal(DEFAULT_CONFIG.maxNearOddsMatches,0);
});

test('quarter line settles half loss correctly',()=>{
  const r=settleAsian({selection:'home',line:-.25,odds:1.9},{home:1,away:1}); assert.equal(r.result,'HALF LOSS'); assert.equal(r.profit,-0.5);
});

test('minus half settles win correctly',()=>{
  const r=settleAsian({selection:'home',line:-.5,odds:1.9},{home:2,away:1}); assert.equal(r.result,'WIN'); assert.equal(r.profit,0.9);
});

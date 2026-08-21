import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToday,parseLiveDetail,parseBet365Asian,handicapPanelUrl} from '../src/parser.js';
import {EngineState,appendMatchSnapshot,canLockSignal,createLockedSignal,trackSourceFreshness} from '../src/index.js';
import {DEFAULT_CONFIG,CONFIG_SCHEMA_VERSION,editableConfig,engineConfig,validateEditableConfig} from '../src/config.js';
import {assessHomeMarket,buildRollingAnalysis,evaluate} from '../src/detector.js';
import {settleAsian} from '../src/settlement.js';

const stats=(attackHome,attackAway,dangerHome,dangerAway,sotHome=0,sotAway=0,offHome=0,offAway=0,cornerHome=0,cornerAway=0)=>({
  attacks:{home:attackHome,away:attackAway},dangerousAttack:{home:dangerHome,away:dangerAway},
  shotsOn:{home:sotHome,away:sotAway},shotsOff:{home:offHome,away:offAway},corners:{home:cornerHome,away:cornerAway},possession:{home:50,away:50}
});
const snapshot=(minute,values)=>({minute,observedAt:minute*60000,stats:values});
function passingSnapshots(currentMinute=55,evidence='sot'){
  const base={sot:10,off:8,corner:4};
  const recent={...base,[evidence]:base[evidence]+1};
  return [
    snapshot(currentMinute-10,stats(40,40,20,20,base.sot,2,base.off,3,base.corner,2)),
    snapshot(currentMinute-5,stats(45,45,22,22,base.sot,2,base.off,3,base.corner,2)),
    snapshot(currentMinute,stats(55,48,28,23,recent.sot,2,recent.off,3,recent.corner,2)),
  ];
}
function evaluatedMatch({minute=55,score={home:0,away:2},evidence='sot',config=DEFAULT_CONFIG,market=null,observedAt=minute*60000}={}){
  const snapshots=passingSnapshots(minute,evidence);
  const rolling=buildRollingAnalysis(snapshots,config);
  return evaluate({id:'m1',minute,score,stats:snapshots.at(-1).stats,rolling},config,market,observedAt);
}
const readyMarket=(line=-0.5,homeOdds=1.80,sourceUpdatedAt=55*60000)=>({status:'AH READY',line,homeOdds,awayOdds:1.95,sourceUpdatedAt});

const HANDICAP_PANEL=`
<div class="oa-market-panel" data-market-panel="handicap">
  <div class="oa-major-list oa-handicap-snapshot active" data-handicap-period="full" data-handicap-phase="pre">
    <div class="oa-major-row"><div class="oa-major-company"><strong>Bet 365</strong></div>
      <div class="oa-major-group"><span data-sort-value="1.85">1.85</span><span data-sort-value="+1.25">+1.25</span><span data-sort-value="1.95">1.95</span></div>
      <div class="oa-major-group oa-major-closing"><span data-sort-value="1.83">1.83</span><span data-sort-value="+1.0">+1.0</span><span data-sort-value="1.98">1.98</span></div>
    </div>
  </div>
  <div class="oa-major-list oa-handicap-snapshot" data-handicap-period="full" data-handicap-phase="inplay">
    <div class="oa-major-table-subhead"><div class="oa-major-group"><span>Home</span><span>Line</span><span>Away</span></div></div>
    <div class="oa-major-row"><div class="oa-major-company"><strong>Bet 365</strong></div>
      <div class="oa-major-group"><span data-sort-value="1.85">1.85</span><span data-sort-value="+1.25">+1.25</span><span data-sort-value="1.95">1.95</span></div>
      <div class="oa-major-group oa-major-closing"><span data-sort-value="1.80">1.80</span><span data-sort-value="-0.5">-0.5</span><span data-sort-value="2.00">2.00</span></div>
    </div>
  </div>
  <div class="oa-major-list oa-handicap-snapshot" data-handicap-period="half" data-handicap-phase="inplay">
    <div class="oa-major-row"><div class="oa-major-company"><strong>Bet365</strong></div>
      <div class="oa-major-group"><span>1.83</span><span>+0.5</span><span>1.98</span></div><div class="oa-major-group"><span>2.85</span><span>0</span><span>1.40</span></div>
    </div>
  </div>
</div>`;

test('today parser extracts a live row and preserves source links',()=>{
  const html=`<table><tr><td><a href="/league/china">China FA Cup</a></td><td>12:00</td><td>72</td><td><a href="/team/view/1">Home FC</a></td><td>1 - 1</td><td><a href="/team/view/2">Away FC</a></td><td>-0.5 (-0.25)</td><td>7 - 4 (3-2)</td><td>10.0</td><td>3.0</td><td>61 - 39</td><td><a href="/stats/home-fc-vs-away-fc/198290122">Stats</a><a href="/odds/home-fc-vs-away-fc/198290122">Odds</a><a href="/live/home-fc-vs-away-fc/198290122">Live</a></td></tr></table>`;
  const [match]=parseToday(html);
  assert.equal(match.id,'198290122'); assert.equal(match.home,'Home FC'); assert.equal(match.minute,72);
  assert.deepEqual(match.score,{home:1,away:1}); assert.deepEqual(match.corner,{home:7,away:4}); assert.deepEqual(match.dangerousAttack,{home:61,away:39});
});

test('regression: a number in 22 de Julio is never parsed as match minute',()=>{
  const html=`<table><tr data-match_id="199844651"><td><a href="/league/view/35264">Ecuador LigaPro Serie B</a></td><td class="today-match-time">21:30</td><td class="text-center match_status"><span></span></td><td class="match_home"><a href="/team/view/12261">LDU Portoviejo</a></td><td class="match_goal">0 - 0</td><td class="match_away"><a href="/team/view/161562">22 de Julio</a></td><td><a href="/stats/ldu-portoviejo-vs-22-de-julio/199844651">Stats</a><a href="/odds/ldu-portoviejo-vs-22-de-julio/199844651">Odds</a></td></tr></table>`;
  const [match]=parseToday(html);
  assert.equal(match.minute,null); assert.equal(match.away,'22 de Julio');
});

test('stats parser reads TotalCorner live-event cumulative metrics',()=>{
  const parsed=parseLiveDetail(`<div>Live Events Status: 72 ' , Score: 1 - 1 , Corner: 7 - 4 5 Shoot on target 2 12 Shoot off target 7 122 Attack 75 61 Dangerous Attack 39 56 Possession % 44 * * * Score: 0 - 0 , Corner: 3 - 2 Half</div>`);
  assert.equal(parsed.valid,true); assert.deepEqual(parsed.attacks,{home:122,away:75}); assert.deepEqual(parsed.shotsOn,{home:5,away:2}); assert.deepEqual(parsed.corners,{home:7,away:4});
});

test('source freshness cache protection remains active',()=>{
  const first=trackSourceFreshness({minute:67,score:{home:0,away:0},stats:{dangerousAttack:{home:40,away:30}},freshness:{}},null,1000,90000);
  const stale=trackSourceFreshness({minute:67,score:{home:0,away:0},stats:{dangerousAttack:{home:40,away:30}},freshness:{}},first,92000,90000);
  assert.equal(stale.freshness.sourceStale,true);
});

test('HOME only: detector never selects or flips to AWAY',()=>{
  const result=evaluatedMatch({market:readyMarket()});
  assert.equal(result.side,'home'); assert.equal(result.state,'SIGNAL');
  const awayDominant=[
    snapshot(45,stats(40,40,20,20,3,1)),
    snapshot(50,stats(45,60,22,30,3,1)),
    snapshot(55,stats(50,90,24,50,4,1)),
  ];
  const decision=evaluate({minute:55,score:{home:0,away:0},stats:awayDominant.at(-1).stats,rolling:buildRollingAnalysis(awayDominant,DEFAULT_CONFIG)},DEFAULT_CONFIG,readyMarket(),55*60000);
  assert.equal(decision.side,'home'); assert.notEqual(decision.state,'SIGNAL');
});

test('minute 54 fails while minute 55 and 88 are inside the detection window',()=>{
  assert.equal(evaluatedMatch({minute:54,market:readyMarket(-.5,1.8,54*60000)}).checks.minute,false);
  assert.equal(evaluatedMatch({minute:55,market:readyMarket()}).checks.minute,true);
  assert.equal(evaluatedMatch({minute:88,market:readyMarket(-.5,1.8,88*60000)}).checks.minute,true);
});

test('score difference does not block when the default score filter is off',()=>{
  const decision=evaluatedMatch({score:{home:0,away:7},market:readyMarket()});
  assert.equal(decision.checks.score,true); assert.equal(decision.state,'SIGNAL');
});

test('rolling delta uses second-half baselines and never counts first-half SOT',()=>{
  const snapshots=[
    snapshot(44,stats(500,500,300,300,9,6,5,4,2,2)),
    snapshot(45,stats(40,40,20,20,10,6,8,4,4,2)),
    snapshot(50,stats(45,45,22,22,10,6,8,4,4,2)),
    snapshot(55,stats(55,48,28,23,11,6,8,4,4,2)),
  ];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.available,true); assert.equal(rolling.recent.delta.shotsOn.home,1); assert.equal(rolling.baselines.previousMinute,45);
});

test('pressure trend compares the latest five minutes with the prior five',()=>{
  const rolling=buildRollingAnalysis(passingSnapshots(),DEFAULT_CONFIG);
  assert.equal(rolling.previous.homePressure,9); assert.equal(rolling.recent.homePressure,22);
  assert.equal(rolling.conditions.homePressureTrend,true); assert.equal(rolling.conditions.matchTempoTrend,true);
});

test('Dangerous Attack Weight changes computed HOME pressure',()=>{
  const snapshots=passingSnapshots();
  const noDanger=buildRollingAnalysis(snapshots,{...DEFAULT_CONFIG,dangerousAttackWeight:0});
  const weighted=buildRollingAnalysis(snapshots,{...DEFAULT_CONFIG,dangerousAttackWeight:2});
  assert.equal(noDanger.recent.homePressure,10); assert.equal(weighted.recent.homePressure,22);
});

test('default hunger gate requires two of three trend conditions',()=>{
  const snapshots=[snapshot(45,stats(40,40,20,20,3,1)),snapshot(50,stats(45,45,22,22,3,1)),snapshot(55,stats(51,51,24,24,4,1))];
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  assert.equal(rolling.passedCount,2);
  const result=evaluate({minute:55,score:{home:0,away:0},stats:snapshots.at(-1).stats,rolling},DEFAULT_CONFIG,readyMarket(),55*60000);
  assert.equal(result.hunger.required,2); assert.equal(result.checks.hunger,true);
});

test('SOT, Shot Off and Corner each satisfy default OR evidence independently',()=>{
  for(const evidence of ['sot','off','corner']){
    const decision=evaluatedMatch({evidence,market:readyMarket()});
    assert.equal(decision.evidence.mode,'ANY'); assert.equal(decision.checks.evidence,true,evidence);
  }
});

test('no new HOME event in the rolling window blocks detection',()=>{
  const snapshots=passingSnapshots().map((item,index)=>index===2?{...item,stats:{...item.stats,shotsOn:{home:10,away:2}}}:item);
  const rolling=buildRollingAnalysis(snapshots,DEFAULT_CONFIG);
  const decision=evaluate({minute:55,score:{home:0,away:0},stats:snapshots.at(-1).stats,rolling},DEFAULT_CONFIG,readyMarket(),55*60000);
  assert.equal(decision.checks.evidence,false); assert.equal(decision.state,'WATCHING');
});

test('1X2 rows can never be parsed as Asian Handicap',()=>{
  const parsed=parseBet365Asian(`<div class="oa-market-panel" data-market-panel="1x2"><div>Bet 365 1.46 3.50 6.00</div></div>`,1234);
  assert.equal(parsed.status,'AH UNAVAILABLE');
});

test('missing Full Match Inplay Handicap returns AH UNAVAILABLE',()=>{
  const parsed=parseBet365Asian(`<div class="oa-market-panel" data-market-panel="handicap"><div class="oa-handicap-snapshot" data-handicap-period="full" data-handicap-phase="pre">Bet 365</div></div>`,1234);
  assert.equal(parsed.status,'AH UNAVAILABLE');
  assert.equal(parseBet365Asian('<div>Loading</div>',1234).status,'AH UNAVAILABLE');
});

test('Bet365 Full Match Live AH reads actual HOME, line and AWAY columns',()=>{
  const parsed=parseBet365Asian(HANDICAP_PANEL,1234);
  assert.deepEqual(parsed,{status:'AH READY',homeOdds:1.8,line:-0.5,awayOdds:2,bookmaker:'Bet365',market:'FULL MATCH LIVE AH',side:'HOME',source:'Bet365 via TotalCorner',sourceUpdatedAt:1234});
  assert.match(handicapPanelUrl('https://www.totalcorner.com/odds/a-vs-b/123'),/panel=handicap/);
});

test('HOME +1 and HOME -0.5 are different allowed lines',()=>{
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[1]};
  assert.equal(assessHomeMarket(readyMarket(-.5),config,55*60000).status,'AH LINE FAIL');
  assert.equal(assessHomeMarket(readyMarket(1),config,55*60000).status,'AH READY');
});

test('odds 1.49 fail and odds 1.50 pass at the default minimum',()=>{
  assert.equal(assessHomeMarket(readyMarket(-.5,1.49),DEFAULT_CONFIG,55*60000).status,'AH ODDS FAIL');
  assert.equal(assessHomeMarket(readyMarket(-.5,1.50),DEFAULT_CONFIG,55*60000).status,'AH READY');
});

test('a price older than 90 seconds is AH STALE',()=>{
  assert.equal(assessHomeMarket(readyMarket(-.5,1.8,1000),DEFAULT_CONFIG,92000).status,'AH STALE');
  assert.equal(assessHomeMarket(readyMarket(-.5,1.8,2000),DEFAULT_CONFIG,92000).status,'AH READY');
});

class MemoryStorage{
  constructor(){this.map=new Map();this.alarm=null;}
  async get(key){return cloneValue(this.map.get(key));}
  async put(key,value){this.map.set(key,cloneValue(value));}
  async delete(key){this.map.delete(key);}
  async transaction(callback){return callback(this);}
  async getAlarm(){return this.alarm;}
  async setAlarm(value){this.alarm=value;}
}
const cloneValue=value=>value==null?value:JSON.parse(JSON.stringify(value));
const fakeState=()=>({storage:new MemoryStorage(),waitUntil:()=>{}});

test('settings save, load and restore default activate only on the next cycle',async()=>{
  const state=fakeState(); await state.storage.put('state',{...{lastCycle:null,lastSuccess:null,lastError:null,matches:[],signals:[],source:{}},cycle:5});
  const engine=new EngineState(state,{});
  const initial=await engine.configState(); assert.equal(initial.active.config.minuteFrom,55);
  const custom={...editableConfig(DEFAULT_CONFIG),minuteFrom:60};
  const staged=await engine.stageConfig(custom,5,'saved'); assert.equal(staged.appliesFromCycle,6);
  assert.equal((await engine.configState()).active.config.minuteFrom,55);
  assert.equal((await engine.activateConfigForCycle(6)).config.minuteFrom,60);
  const restored=await engine.stageConfig(editableConfig(DEFAULT_CONFIG),6,'restore_default'); assert.equal(restored.version,3);
  assert.equal((await engine.activateConfigForCycle(7)).config.minuteFrom,55);
  assert.ok((await engine.configState()).history.length>=3);
});

test('invalid or partial config is rejected as a whole before storage changes',async()=>{
  const state=fakeState(); const engine=new EngineState(state,{}); const before=await engine.configState();
  const invalid={...editableConfig(DEFAULT_CONFIG),minuteFrom:90,minuteTo:60,oddsMinimum:0.9};
  const result=validateEditableConfig(invalid,{requireAll:true}); assert.equal(result.ok,false); assert.ok(result.errors.length>=2);
  const partial=validateEditableConfig({minuteFrom:60},{requireAll:true}); assert.equal(partial.ok,false);
  const after=await engine.configState(); assert.deepEqual(after.active,before.active); assert.equal(after.pending,null);
});

test('one signal per match blocks a second lock by default',()=>{
  const match={id:'m1',state:'SIGNAL',freshness:{sourceStale:false}};
  assert.equal(canLockSignal([],match,DEFAULT_CONFIG),true);
  assert.equal(canLockSignal([{matchId:'m1'}],match,DEFAULT_CONFIG),false);
});

test('every locked signal contains immutable config snapshot metadata',()=>{
  const config=engineConfig(DEFAULT_CONFIG);
  const match={id:'m1',league:'L',home:'Home',away:'Away',selectionLine:-.5,selectionOdds:1.8,minute:57,score:{home:0,away:2},stats:stats(1,1,1,1),hunger:{passed:true},rolling:{available:true},market:readyMarket(),state:'SIGNAL',freshness:{sourceStale:false}};
  const envelope={schemaVersion:CONFIG_SCHEMA_VERSION,version:7,updatedAt:1000,appliesFromCycle:9};
  const signal=createLockedSignal(match,envelope,config,2000);
  assert.equal(signal.selection,'home'); assert.equal(signal.configSnapshot.version,7); assert.equal(signal.configSnapshot.values.minuteFrom,55);
});

test('truth test: 0-2 at minute 57 passes ANY but fails configured +1 line',()=>{
  const any=evaluatedMatch({minute:57,score:{home:0,away:2},market:readyMarket(-.5,1.8,57*60000),observedAt:57*60000});
  assert.equal(any.checks.score,true); assert.equal(any.state,'SIGNAL');
  const plusOneOnly={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[1]};
  const restricted=evaluatedMatch({minute:57,score:{home:0,away:2},config:plusOneOnly,market:readyMarket(-.5,1.8,57*60000),observedAt:57*60000});
  assert.equal(restricted.priceStatus,'AH LINE FAIL'); assert.notEqual(restricted.state,'SIGNAL');
});

test('snapshot appending keeps time-ordered cumulative history',()=>{
  const match={minute:55,stats:stats(1,1,1,1)};
  const result=appendMatchSnapshot([snapshot(54,stats(0,0,0,0)),snapshot(55,stats(0,0,0,0))],match,1000);
  assert.deepEqual(result.map(item=>item.minute),[54,55]); assert.equal(result.at(-1).observedAt,1000);
});

test('Asian quarter-line settlement regressions still pass',()=>{
  const quarter=settleAsian({selection:'home',line:-.25,odds:1.9},{home:1,away:1});
  const half=settleAsian({selection:'home',line:-.5,odds:1.9},{home:2,away:1});
  assert.equal(quarter.result,'HALF LOSS'); assert.equal(quarter.profit,-0.5);
  assert.equal(half.result,'WIN'); assert.equal(half.profit,0.9);
});

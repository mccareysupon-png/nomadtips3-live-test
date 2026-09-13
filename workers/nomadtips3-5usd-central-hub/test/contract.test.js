import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');

test('live compound feed paginates safely at include cap 50',()=>{
  assert.match(source,/status=live&include=odds,events,stats/);
  assert.match(source,/LIVE_PAGE_SIZE=50/);
  assert.match(source,/LIVE_MAX_PAGES=10/);
  assert.match(source,/paginationOf/);
  assert.match(source,/LIVE_TTL_MS=55_000/);
});

test('step 03 exposes health live and shadow referees only',()=>{
  assert.match(source,/url\.pathname==='\/health'/);
  assert.match(source,/url\.pathname==='\/live'/);
  assert.match(source,/url\.pathname==='\/referees'/);
  assert.doesNotMatch(source,/\/signal/);
  assert.doesNotMatch(source,/\/settle/);
});

test('ten referee sockets map exactly to existing 3.41 positions',()=>{
  const expected=[
    ['source5',5,'1xBet','1xbet'],
    ['source6',6,'Bet365','bet365'],
    ['source9',9,'Macauslot','macauslot'],
    ['source10',10,'Crown','crown'],
    ['source14',14,'Easybets','easybets'],
    ['source15',15,'Vcbet','vcbet'],
    ['source16',16,'Interwetten','interwetten'],
    ['source18',18,'12Bet','12bet'],
    ['source21',21,'18Bet','18bet'],
    ['source25',25,'Pinnacle','pinnacle']
  ];
  for(const [sourceId,position,bookmaker,slug] of expected){
    assert.match(source,new RegExp(`sourceId:'${sourceId}',position:${position},bookmaker:'${bookmaker}',slug:'${slug}'`));
  }
});

test('all referee outputs are hard locked to shadow no-vote mode',()=>{
  assert.match(source,/mode:'SHADOW_ONLY'/);
  assert.match(source,/votingEnabled:false/);
  assert.match(source,/shadowOnly:true/);
  assert.match(source,/voteEligible:false/);
  assert.doesNotMatch(source,/voteEligible:true/);
});

test('referee request is one multi-bookmaker asian call per fixture refresh',()=>{
  assert.match(source,/fixtures\/\$\{encodeURIComponent\(fixtureId\)\}\/odds\?market=asian&bookmakers=/);
  assert.match(source,/REFEREE_TTL_MS=55_000/);
  assert.match(source,/refereePromises=new Map/);
});

test('timestamp policy never claims bookmaker quote time',()=>{
  assert.match(source,/timestampKind:'hub_observed_at'/);
  assert.match(source,/lastChangedAtKind:'hub_detected_change_at'/);
  assert.match(source,/sourceUpdatedAt:null/);
  assert.match(source,/neither is bookmaker-native quote time/);
  assert.match(readme,/must not be passed to 3\.41 as bookmaker-native sourceUpdatedAt/);
});

test('hub still does not auto scan or auto deploy by configuration',()=>{
  assert.doesNotMatch(wrangler,/"triggers"/);
  assert.doesNotMatch(wrangler,/"crons"/);
  assert.match(readme,/NOT CONNECTED/);
  assert.match(readme,/NOT DEPLOYED/);
});

test('normalized live contract keeps 3.41 detector metrics available',()=>{
  for(const field of ['attacks','dangerousAttack','shotsOn','shotsOff','corners','possession']) assert.match(source,new RegExp(`${field}:`));
  assert.match(source,/events:Array\.isArray\(f\?\.events\)/);
  assert.match(source,/bookmaker:'Bet365'/);
});

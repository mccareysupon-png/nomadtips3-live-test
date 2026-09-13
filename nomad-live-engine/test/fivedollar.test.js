import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIVEUSD_CADENCE,FIVEUSD_REFEREES,classifyBoardState,dedupeFixtures,fetchLiveFixtures,
  filterBoardFixtures,normalizeFixture,normalizeReferee,
} from '../src/fivedollar.js';

function fixture(overrides={}){
  return {
    id:1001,
    status:'live',
    status_code:'67',
    minute:67,
    kickoff_utc:'2026-09-13T12:00:00Z',
    league:{id:9,name:'Test League',country:'TH'},
    teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}},
    goals:{home:1,away:0},
    corners:{home:4,away:2},
    statistics:{
      attacks:{home:70,away:55},
      dangerous_attacks:{home:34,away:22},
      shots_on_target:{home:5,away:2},
      shots_off_target:{home:7,away:5},
      possession:{home:58,away:42},
    },
    events:[{type:'corner',minute:66,team:'home'}],
    ...overrides,
  };
}

function jsonResponse(payload,{status=200,headers={}}={}){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json',...headers}});
}

test('3.41 native cadence keeps 3s compound live polling behind provider ceiling only',()=>{
  assert.equal(FIVEUSD_CADENCE.liveRefreshMs,3000);
  assert.equal(FIVEUSD_CADENCE.upcomingRefreshMs,120000);
  assert.equal(FIVEUSD_CADENCE.providerRequestCeilingPer60s,40);
  assert.equal(FIVEUSD_CADENCE.livePageSize,50);
  assert.equal(FIVEUSD_CADENCE.liveMaxPages,10);
  assert.equal('liveRequestBudgetPer60s' in FIVEUSD_CADENCE,false);
  assert.equal('refereeRequestBudgetPer60s' in FIVEUSD_CADENCE,false);
});

test('normalizes every 3.41 detector metric without fabricating provider timestamp',()=>{
  const observedAt=1_700_000_000_000;
  const row=normalizeFixture(fixture(),observedAt);
  assert.equal(row.fixtureId,'1001');
  assert.equal(row.boardState,'live');
  assert.equal(row.minute,67);
  assert.deepEqual(row.score,{home:1,away:0});
  assert.deepEqual(row.stats.attacks,{home:70,away:55});
  assert.deepEqual(row.stats.dangerousAttack,{home:34,away:22});
  assert.deepEqual(row.stats.shotsOn,{home:5,away:2});
  assert.deepEqual(row.stats.shotsOff,{home:7,away:5});
  assert.deepEqual(row.stats.corners,{home:4,away:2});
  assert.deepEqual(row.stats.possession,{home:58,away:42});
  assert.equal(row.events.length,1);
  assert.equal(row.provenance.observedAt,observedAt);
  assert.equal(row.provenance.sourceUpdatedAt,null);
});

test('terminal fixtures are never eligible for live board',()=>{
  for(const status of ['finished','FT','ended','cancelled','abandoned','postponed']){
    assert.equal(classifyBoardState(fixture({status,status_code:status})), 'terminal');
  }
});

test('board contains live plus scheduled only inside configurable waiting window',()=>{
  const at=Date.parse('2026-09-13T12:00:00Z');
  const rows=[
    normalizeFixture(fixture({id:1,status:'live',status_code:'30',kickoff_utc:'2026-09-13T11:30:00Z'}),at),
    normalizeFixture(fixture({id:2,status:'scheduled',status_code:'NS',kickoff_utc:'2026-09-13T13:00:00Z'}),at),
    normalizeFixture(fixture({id:3,status:'scheduled',status_code:'NS',kickoff_utc:'2026-09-13T16:30:00Z'}),at),
    normalizeFixture(fixture({id:4,status:'finished',status_code:'FT',kickoff_utc:'2026-09-13T10:00:00Z'}),at),
  ];
  const board=filterBoardFixtures(rows,{at,upcomingWindowMs:2*60*60*1000});
  assert.deepEqual(board.map(row=>row.fixtureId).sort(),['1','2']);
});

test('live fetch uses page size 50, paginates and deduplicates fixture ids',async()=>{
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(String(url));
    const page=Number(new URL(url).searchParams.get('page'));
    if(page===1) return jsonResponse({data:[fixture({id:10}),fixture({id:11})],pagination:{has_more:true,page:1,per_page:50}});
    return jsonResponse({data:[fixture({id:11}),fixture({id:12})],pagination:{has_more:false,page:2,per_page:50}});
  };
  const result=await fetchLiveFixtures({apiKey:'test-secret',fetchImpl,maxPages:4,observedAt:12345});
  assert.equal(result.requests,2);
  assert.deepEqual(result.fixtures.map(row=>row.fixtureId).sort(),['10','11','12']);
  assert.equal(new URL(urls[0]).searchParams.get('per_page'),'50');
  assert.equal(new URL(urls[0]).searchParams.get('status'),'live');
  assert.equal(new URL(urls[0]).searchParams.get('include'),'odds,events,stats');
});

test('generic dedupe keeps one row per fixture id',()=>{
  const rows=dedupeFixtures([fixture({id:7,minute:1}),fixture({id:7,minute:2}),fixture({id:8})]);
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.id===7).minute,2);
});

test('10 referee identities stay shadow-only and observational freshness stays explicit',()=>{
  assert.equal(FIVEUSD_REFEREES.length,10);
  const definition=FIVEUSD_REFEREES.find(item=>item.slug==='bet365');
  const book={slug:'bet365',odds:{asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.99}}}};
  const first=normalizeReferee(definition,book,1000,null);
  const second=normalizeReferee(definition,book,2000,first);
  assert.equal(first.status,'AH READY');
  assert.equal(first.line,-0.5);
  assert.equal(first.homeOdds,1.91);
  assert.equal(first.awayOdds,1.99);
  assert.equal(first.sourceUpdatedAt,null);
  assert.equal(first.shadowOnly,true);
  assert.equal(first.voteEligible,false);
  assert.equal(second.lastChangedAt,1000);
  assert.equal(second.observedAt,2000);
});

test('missing bookmaker or invalid AH fails closed',()=>{
  const definition=FIVEUSD_REFEREES[0];
  assert.equal(normalizeReferee(definition,null,1000).status,'BOOKMAKER UNAVAILABLE');
  const bad={slug:'1xbet',odds:{asian_handicap:{inplay:{line:0.13,home:1.9,away:1.9}}}};
  const row=normalizeReferee(definition,bad,1000);
  assert.equal(row.status,'AH INVALID');
  assert.equal(row.line,null);
});
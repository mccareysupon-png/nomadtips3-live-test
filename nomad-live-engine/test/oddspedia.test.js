import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {
  fetchOddspediaBet365Markets,matchOddspediaEvent,parseOddspediaBet365Asian,
  parseOddspediaEventLinks,parseOddspediaPrice,selectOddspediaCandidate
} from '../src/oddspedia.js';

const observedAt=Date.parse('2026-08-22T07:00:00Z');
const pad=body=>`<!doctype html><html><body>${body}${' '.repeat(600)}</body></html>`;

test('Oddspedia event discovery maps the same HOME and AWAY without reversing sides',()=>{
  const html=pad(`
    <a href="/football/home-fc-away-fc-12345"><span>Home FC</span><span>Away FC</span></a>
    <a href="/football/away-fc-home-fc-99999"><span>Away FC</span><span>Home FC</span></a>
  `);
  const events=parseOddspediaEventLinks(html);
  const matched=matchOddspediaEvent({home:'Home FC',away:'Away FC'},events);
  assert.equal(matched.eventId,'12345');
  assert.equal(matched.url,'https://oddspedia.com/football/home-fc-away-fc-12345');
});

test('Oddspedia converts American prices to decimal while keeping decimal prices unchanged',()=>{
  assert.equal(parseOddspediaPrice('-111'),1.9009);
  assert.equal(parseOddspediaPrice('+150'),2.5);
  assert.equal(parseOddspediaPrice('1.86'),1.86);
});

test('Oddspedia never mixes Bet365 HOME with another bookmaker AWAY',()=>{
  const html=pad(`
    <section><h3>Asian Handicap</h3><button>Full Time</button><button>1st Half</button>
      <div>+0.75/-0.75</div><div>Main line</div><div>Home</div><img alt="bet365"><span>1.90</span>
      <div>Away</div><img alt="Fezbet"><span>1.90</span><div>Compare odds</div>
    </section><h3>Both Teams to Score</h3>
  `);
  const parsed=parseOddspediaBet365Asian(html,observedAt);
  assert.equal(parsed.status,'AH UNAVAILABLE');
  assert.equal(parsed.reason,'bookmaker_pair_not_found');
});

test('Oddspedia parses one intact Full Time Bet365 AH pair and honors Settings',()=>{
  const html=pad(`
    <section><h3>Asian Handicap</h3><button>Full Time</button><button>1st Half</button><button>2nd Half</button>
      <div>+0.75/-0.75</div><div>Main line</div><div>Home</div><img alt="bet365"><span>-111</span>
      <div>Away</div><img alt="Fezbet"><span>-105</span><div>Compare odds</div>
      <div>-1.25/+1.25</div><img alt="bet365"><span>+150</span><img alt="bet365"><span>-175</span><div>Compare odds</div>
    </section><h3>Both Teams to Score</h3>
  `);
  const parsed=parseOddspediaBet365Asian(html,observedAt);
  assert.equal(parsed.status,'AH READY');
  assert.equal(parsed.candidates.length,1);
  assert.deepEqual(
    [parsed.candidates[0].line,parsed.candidates[0].homeOdds,parsed.candidates[0].awayOdds],
    [-1.25,2.5,1.5714],
  );
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[-1.25],oddsMinimum:1.50};
  const selected=selectOddspediaCandidate(parsed,config);
  assert.equal(selected.bookmaker,'Bet365');
  assert.equal(selected.line,-1.25);
  assert.equal(selected.homeOdds,2.5);
});

test('Oddspedia reports parser failure instead of inventing a price when structure changes',()=>{
  const parsed=parseOddspediaBet365Asian(pad('<div>Full Time Result</div><div>bet365 1.90</div>'),observedAt);
  assert.equal(parsed.status,'AH UNAVAILABLE');
  assert.equal(parsed.reason,'parser_failed:asian_handicap_section_not_found');
});

test('Oddspedia source fails closed on HTTP 403 without throwing into the engine',async()=>{
  const fetchImpl=async()=>new Response('blocked',{status:403});
  const result=await fetchOddspediaBet365Markets(
    [{id:'m1',home:'Home FC',away:'Away FC'}],DEFAULT_CONFIG,observedAt,fetchImpl,
  );
  assert.equal(result.status,'ERROR');
  assert.equal(result.error,'source_blocked:http_403');
  assert.equal(result.results[0].market.status,'AH UNAVAILABLE');
  assert.equal(result.results[0].market.reason,'source_blocked:http_403');
});

test('Oddspedia full scrape path resolves event then returns Bet365 AH as one market record',async()=>{
  const index=pad('<a href="/football/home-fc-away-fc-12345"><span>Home FC</span><span>Away FC</span></a>');
  const event=pad(`
    <section><h3>Asian Handicap</h3><button>Full Time</button><button>1st Half</button>
      <div>-0.50/+0.50</div><div>Main line</div><div>Home</div><img alt="bet365"><span>1.86</span>
      <div>Away</div><img alt="bet365"><span>1.96</span><div>Compare odds</div>
    </section><h3>Both Teams to Score</h3>
  `);
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(String(url));
    if(String(url)==='https://oddspedia.com/football') return new Response(index,{status:200,headers:{date:new Date(observedAt).toUTCString()}});
    if(String(url)==='https://oddspedia.com/football/home-fc-away-fc-12345') return new Response(event,{status:200,headers:{date:new Date(observedAt).toUTCString()}});
    return new Response('missing',{status:404});
  };
  const result=await fetchOddspediaBet365Markets(
    [{id:'m1',home:'Home FC',away:'Away FC'}],DEFAULT_CONFIG,observedAt,fetchImpl,
  );
  assert.equal(result.status,'READY');
  assert.equal(result.mapped,1);
  assert.equal(result.ready,1);
  assert.equal(result.results[0].market.status,'AH READY');
  assert.equal(result.results[0].market.source,'Oddspedia');
  assert.equal(result.results[0].market.bookmaker,'Bet365');
  assert.equal(result.results[0].market.line,-.5);
  assert.equal(result.results[0].market.homeOdds,1.86);
  assert.equal(result.results[0].market.awayOdds,1.96);
  assert.equal(result.results[0].market.eventId,'12345');
  assert.deepEqual(calls,[
    'https://oddspedia.com/football',
    'https://oddspedia.com/football/home-fc-away-fc-12345',
  ]);
});

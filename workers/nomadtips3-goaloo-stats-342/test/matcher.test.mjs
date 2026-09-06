import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function api(){
  const store={};
  const context={
    window:{},
    sessionStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}},
    location:{href:'https://www.nomadtips3.com/nomad-live-342/'},
    URL,
    fetch:()=>{throw new Error('not used')},
    AbortController,
    Headers,
    Response,
    setTimeout,
    clearTimeout,
    console,
  };
  const source=fs.readFileSync('nomad-live-342/goaloo-stats-layer.js','utf8');
  vm.runInNewContext(source,context,{filename:'goaloo-stats-layer.js'});
  return context.window.NOMAD342_GOALOO_STATS;
}

const event={id:'tc-1',league:'Japan J League',home:'Hokkaido Consadole Sapporo',away:'Tochigi City',minute:67,score:[1,0]};

test('exact teams, score and close minute produce one Goaloo match',()=>{
  const x=api();
  const picked=x.choose(event,[
    {sourceMatchId:'g1',league:'J1 League',home:'Hokkaido Consadole Sapporo',away:'Tochigi City',minute:68,score:{home:1,away:0}},
    {sourceMatchId:'g2',league:'Other',home:'Hokkaido Consadole Sapporo U18',away:'Tochigi City U18',minute:68,score:{home:1,away:0}},
  ]);
  assert.equal(picked.reason,'MATCHED');
  assert.equal(picked.match.sourceMatchId,'g1');
});

test('score mismatch is rejected even when team names are exact',()=>{
  const x=api();
  const picked=x.choose(event,[{sourceMatchId:'g1',league:'J1 League',home:event.home,away:event.away,minute:67,score:{home:0,away:1}}]);
  assert.equal(picked.match,null);
  assert.equal(picked.reason,'NO_CANDIDATE');
});

test('minute gap beyond five minutes is rejected for initial mapping',()=>{
  const x=api();
  const picked=x.choose(event,[{sourceMatchId:'g1',league:'J1 League',home:event.home,away:event.away,minute:74,score:{home:1,away:0}}]);
  assert.equal(picked.match,null);
});

test('reversed HOME/AWAY orientation is never accepted',()=>{
  const x=api();
  const picked=x.choose(event,[{sourceMatchId:'g1',league:'J1 League',home:event.away,away:event.home,minute:67,score:{home:0,away:1}}]);
  assert.equal(picked.match,null);
});

test('common Utd and United alias can match without weakening score guard',()=>{
  const x=api();
  const e={id:'tc-2',league:'England Premier League',home:'Manchester Utd',away:'Chelsea FC',minute:55,score:[2,1]};
  const picked=x.choose(e,[{sourceMatchId:'g9',league:'English Premier League',home:'Manchester United',away:'Chelsea',minute:54,score:{home:2,away:1}}]);
  assert.equal(picked.reason,'MATCHED');
  assert.equal(picked.match.sourceMatchId,'g9');
});

test('two near-equal candidates fail closed as ambiguous',()=>{
  const x=api();
  const rows=[
    {sourceMatchId:'a',league:'Japan J League',home:event.home,away:event.away,minute:67,score:{home:1,away:0}},
    {sourceMatchId:'b',league:'Japan J League',home:event.home,away:event.away,minute:68,score:{home:1,away:0}},
  ];
  const picked=x.choose(event,rows);
  assert.equal(picked.match,null);
  assert.equal(picked.reason,'AMBIGUOUS');
});

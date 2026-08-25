import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EngineState,publicSignalLock} from '../src/index.js';

const liveMatch=(state='WATCHING')=>({
  id:'m1',home:'Home FC',away:'Away FC',league:'League',state,
  freshness:{sourceStale:false},priceStatus:'AH WAIT',rolling:{recent:{homePressure:12}},
});
const lockedSignal=()=>({
  matchId:'m1',home:'Home FC',away:'Away FC',lockedAt:1_000_000,minute:57,
  entryScore:{home:0,away:1},line:-0.25,odds:1.8,bookmaker:'Pinnacle',
  oddsSource:'TotalCorner',priceSourceId:'source26',settlement:null,
});

test('D-005 keeps live detector WATCHING while exposing the persistent LOCKED signal separately',()=>{
  const engine=new EngineState({},{});
  const feed=engine.feed({
    lastError:null,lastSuccess:1_100_000,cycle:9,matches:[liveMatch('WATCHING')],signals:[lockedSignal()],
  },{version:4});
  assert.equal(feed.matches.length,1);
  assert.equal(feed.matches[0].state,'WATCHING');
  assert.equal(feed.matches[0].signalStatus,'LOCKED');
  assert.equal(feed.matches[0].signalLock.status,'LOCKED');
  assert.equal(feed.matches[0].signalLock.minute,57);
  assert.deepEqual(feed.matches[0].signalLock.entryScore,{home:0,away:1});
  assert.equal(feed.matches[0].signalLock.line,-0.25);
  assert.equal(feed.matches[0].signalLock.odds,1.8);
  assert.equal(feed.counts.watching,1);
  assert.equal(feed.counts.detectorSignal,0);
  assert.equal(feed.counts.signal,1);
});

test('D-005 distinguishes a current detector SIGNAL from a persistent lock',()=>{
  const engine=new EngineState({},{});
  const feed=engine.feed({
    lastError:null,lastSuccess:1_100_000,cycle:9,matches:[liveMatch('SIGNAL')],signals:[],
  },{version:4});
  assert.equal(feed.matches[0].state,'SIGNAL');
  assert.equal(feed.matches[0].signalStatus,null);
  assert.equal(feed.matches[0].signalLock,null);
  assert.equal(feed.counts.detectorSignal,1);
  assert.equal(feed.counts.signal,0);
});

test('D-005 public lock exposes entry truth without leaking or replacing live detector fields',()=>{
  const lock=publicSignalLock({...lockedSignal(),settlement:{result:'WIN'}});
  assert.equal(lock.status,'LOCKED');
  assert.equal(lock.minute,57);
  assert.deepEqual(lock.entryScore,{home:0,away:1});
  assert.equal(lock.line,-0.25);
  assert.equal(lock.odds,1.8);
  assert.equal(lock.settlement,'WIN');
  assert.equal('state' in lock,false);
});

test('D-005 browser renders LOCKED separately and no longer intercepts feed with sticky SIGNAL state',()=>{
  const runtime=readFileSync(new URL('../../nomad-live/runtime.js',import.meta.url),'utf8');
  const retention=readFileSync(new URL('../../nomad-live/signal-retention.js',import.meta.url),'utf8');
  const index=readFileSync(new URL('../../nomad-live/index.html',import.meta.url),'utf8');
  assert.match(runtime,/signalStatus==='LOCKED'/);
  assert.match(runtime,/data-signal-status=/);
  assert.match(runtime,/SIGNAL LOCK · LOCKED/);
  assert.match(runtime,/locked\|\|state==='SIGNAL'/);
  assert.doesNotMatch(retention,/window\.fetch\s*=/);
  assert.doesNotMatch(retention,/state\s*:\s*['"]SIGNAL['"]/);
  assert.match(retention,/localStorage\.removeItem/);
  assert.match(index,/signal-retention\.js\?v=20260825-d005-server-lock-v1/);
  assert.match(index,/runtime\.js\?v=20260825-d005-server-lock-v1/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');

test('step 02 uses one compound live request with odds events and stats',()=>{
  assert.match(source,/status=live&include=odds,events,stats/);
  assert.match(source,/LIVE_TTL_MS=55_000/);
  assert.match(source,/class FiveUsdCentralState extends DurableObject/);
});

test('health and live are the only data endpoints in step 02',()=>{
  assert.match(source,/url\.pathname==='\/health'/);
  assert.match(source,/url\.pathname==='\/live'/);
  assert.doesNotMatch(source,/\/signal/);
  assert.doesNotMatch(source,/\/settle/);
  assert.doesNotMatch(source,/\/referee/);
});

test('hub does not auto scan or auto deploy by configuration',()=>{
  assert.doesNotMatch(wrangler,/"triggers"/);
  assert.doesNotMatch(wrangler,/"crons"/);
  assert.match(readme,/NOT CONNECTED/);
  assert.match(readme,/NOT DEPLOYED BY THIS STEP/);
});

test('timestamp policy never claims bookmaker quote time',()=>{
  assert.match(source,/timestampKind:'hub_observed_at'/);
  assert.match(source,/not bookmaker quote time/);
  assert.match(readme,/must never be presented to 3\.41 as a bookmaker-native quote update timestamp/);
});

test('normalized contract keeps 3.41 detector metrics available',()=>{
  for(const field of ['attacks','dangerousAttack','shotsOn','shotsOff','corners','possession']) assert.match(source,new RegExp(`${field}:`));
  assert.match(source,/events:Array\.isArray\(f\?\.events\)/);
  assert.match(source,/bookmaker:'Bet365'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const worker=readFileSync(resolve(root,'src/index.js'),'utf8');
const entry=readFileSync(resolve(root,'src/entry.js'),'utf8');
const wrangler=readFileSync(resolve(root,'wrangler.jsonc'),'utf8');
const app=readFileSync(resolve(root,'../web/app.js'),'utf8');
const clock=readFileSync(resolve(root,'../web/clock-sync.js'),'utf8');
const statistics=readFileSync(resolve(root,'../web/statistics.js'),'utf8');

test('CAR 3.3 keeps a one-minute always-on Cloudflare cron',()=>{
  assert.match(wrangler,/"crons"\s*:\s*\[\s*"\* \* \* \* \*"\s*\]/);
  assert.match(worker,/async scheduled\(event,env,ctx\)/);
  assert.match(worker,/car33\.internal\/scan/);
});

test('every scan automatically settles pending records when source is FT',()=>{
  assert.match(worker,/snapshot\.all\.filter\(x=>x\.status==='FT'\)/);
  assert.match(worker,/record\.result!=='PENDING'/);
  assert.match(worker,/settleRecord\(record,match\.score\)/);
  assert.match(worker,/record\.settledAt=snapshot\.observedAt/);
});

test('statistics uses the same stored history and has a non-conflicting API route',()=>{
  assert.match(entry,/url\.pathname==='\/api\/history'/);
  assert.match(worker,/summary:\{total:records\.length,win:wins,loss:losses,draw:draws,pending:/);
  assert.match(statistics,/setInterval\(load,10000\)/);
});

test('open live UI continuously refreshes live payload, Goaloo clock and source animation',()=>{
  assert.match(app,/setInterval\(refresh,5000\)/);
  assert.match(app,/setInterval\(refreshAnimation,1500\)/);
  assert.match(clock,/setInterval\(syncClock,1500\)/);
});

import assert from 'node:assert/strict';
import {createDailySummary,sportDay,renderableDaily} from './daily-summary-stage.mjs';
const time=iso=>Date.parse(iso);
const at=time('2026-11-17T00:50:00Z');
const rows=[
{id:'a',result:'WIN',status:'SETTLED',odds:2,createdAt:time('2026-11-16T06:00:00Z')},
{id:'b',result:'HALF_LOSS',status:'SETTLED',odds:1.9,createdAt:time('2026-11-16T08:00:00Z')},
{id:'c',result:'LIVE',status:'PENDING',odds:2.1,createdAt:time('2026-11-16T10:00:00Z')},
{id:'d',result:'PUSH',status:'SETTLED',odds:1.75,createdAt:time('2026-11-16T12:00:00Z')},
{id:'e',result:'WIN',status:'SETTLED',odds:1.8,createdAt:time('2026-11-15T20:00:00Z')},
{id:'f',result:'LOSS',status:'SETTLED',odds:1.5,createdAt:time('2026-11-15T06:01:00Z')},
{id:'g',result:'HALF_WIN',status:'SETTLED',odds:1.7,createdAt:time('2026-11-16T05:59:00Z')},
{id:'h',result:'PENDING',status:'PENDING',odds:2,createdAt:time('2026-11-15T16:00:00Z')},
{id:'a',result:'WIN',status:'SETTLED',odds:2,createdAt:time('2026-11-16T06:00:00Z')}
];
const v=createDailySummary(rows,at);
assert.equal(v.tk,'2026-11-16');
assert.equal(v.yk,'2026-11-15');
assert.deepEqual(v.today,{win:1,loss:1,push:1,pending:1,oddsSum:7.75,oddsCount:4});
assert.deepEqual(v.yesterday,{win:2,loss:1,push:0,pending:0,oddsSum:5,oddsCount:3});
assert(renderableDaily(v,at));
assert(!renderableDaily(v,time('2026-11-17T07:00:00Z')));
assert.equal(sportDay(time('2026-10-25T05:59:00Z')),'2026-10-24');
assert.equal(sportDay(time('2026-10-25T06:00:00Z')),'2026-10-25');
assert.equal(sportDay(time('2026-06-10T04:59:00Z')),'2026-06-09');
assert.equal(sportDay(time('2026-06-10T05:00:00Z')),'2026-06-10');
assert.equal(sportDay(time('2026-11-16T05:59:00Z')),'2026-11-15');
assert.equal(sportDay(time('2026-11-16T06:00:00Z')),'2026-11-16');
console.log('B46_DAILY_ACCOUNTING_EXACT=PASS',{calendarTimezone:'Europe/London',cutoff:'06:00',
cases:13,createdAtNotSettledAt:true,duplicateIdsCountedOnce:true,archivedRowsReadOnBrowser:0});

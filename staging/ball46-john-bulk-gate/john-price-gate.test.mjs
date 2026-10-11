import assert from 'node:assert/strict';
import {planPriceRequests,verifyTick} from './john-price-gate.mjs';
const candidates=[
 {fixtureId:101,market:'ft_over',qualified:true},
 {fixtureId:101,market:'ft_under',qualified:true},
 {fixtureId:102,market:'ft_corner_over',qualified:true},
 {fixtureId:103,market:'ft_1x2',qualified:true},
 {fixtureId:104,market:'ht_over',qualified:false}
];
const p=(other={})=>planPriceRequests({candidates,providerRemaining:15,...other});
assert.equal(p().externalRequestsPlanned,2,'FT Over and Under must share one request');
assert.equal(p({providerRemaining:8}).externalRequestsPlanned,0,'reserved upstream bulk headroom');
assert.equal(p({providerRemaining:0}).externalRequestsPlanned,0,'cannot call over depleted quota');
assert.equal(p({providerRemaining:undefined}).externalRequestsPlanned,0,'unknown account quota fail closed');
assert.equal(p({retryAfterSec:17}).externalRequestsPlanned,0,'honor Retry-After');
assert.equal(p({providerRemaining:100,maximum:1}).externalRequestsPlanned,1,'single global cap');
const now=Date.parse('2026-10-11T12:22:00Z');
const payload=()=>({success:1,data:{fixture_id:101,bookmaker:{slug:'bet365'},market:'goalline',
 ticks:[{minute:62,line:2.75,over:1.9,under:1.91,recorded_at:'2026-10-11T12:21:45Z'}]},
 pagination:{has_more:false}});
const opts={fixtureId:101,market:'goalline',bookmaker:'bet365',fixtureMinute:62,now};
assert.equal(verifyTick(payload(),opts).line,2.75,'valid fresh tick');
const modify=change=>{const x=payload();change(x);return verifyTick(x,opts)};
assert.equal(modify(x=>x.data.ticks[0].suspended=true),null,'suspension');
assert.equal(modify(x=>x.data.ticks[0].over=null),null,'unpaired odds');
assert.equal(modify(x=>x.data.ticks[0].recorded_at='2026-10-11T12:18:45Z'),null,'stale');
assert.equal(modify(x=>x.data.bookmaker.slug='crown'),null,'wrong bookmaker');
assert.equal(modify(x=>x.data.ticks[0].line=1.32),null,'invented line');
assert.equal(modify(x=>x.data.ticks[0].minute=42),null,'wrong fixture minute');
assert.equal(modify(x=>x.pagination.has_more=true),null,'unreviewed paginated final tick');
const many=Array.from({length:132},(_,i)=>({fixtureId:i+1,market:'ft_over',qualified:true}));
for(let minute=0;minute<132;minute++){
 const plan=planPriceRequests({candidates:many,providerRemaining:10,headroomForBulk:8,maximum:3,cursor:minute*3});
 assert(plan.externalRequestsPlanned<=2,'132 fixtures cannot produce unbounded calls');
}
console.log('PASS John bulk-first admission: 132 fixtures, no fanout, shared quota, freshness, fail-closed');

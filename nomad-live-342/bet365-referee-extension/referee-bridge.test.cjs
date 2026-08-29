'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const dir=__dirname;
const sent=[];
let rawHandler=null;
const bridgeContext={
  console,
  window:{addEventListener:(name,fn)=>{if(name==='nomad:bet365-raw-frame')rawHandler=fn;}},
  chrome:{runtime:{lastError:null,sendMessage:(message,cb)=>{sent.push(message);if(cb)cb({ok:true});}}},
  setTimeout,clearTimeout,TextDecoder,ArrayBuffer,Uint8Array
};
vm.createContext(bridgeContext);
vm.runInContext(fs.readFileSync(path.join(dir,'bet365-bridge.js'),'utf8'),bridgeContext,{filename:'bet365-bridge.js'});
assert.equal(typeof rawHandler,'function','raw frame listener missing');

const snapshot='\x14OVInPlay_1_3\x01F|CL;ID=1;NA=Soccer;|EV;IT=C1A_1_3;OI=12345;NA=Alpha FC v Beta FC;CT=Test League;SS=0-0;TM=60;MD=1;|MA;FI=12345;ID=MKT1;NA=Asian Handicap;|PA;FI=12345;ID=HOME1;NA=Alpha FC;HA=-0.5;OD=1.90;|PA;FI=12345;ID=AWAY1;NA=Beta FC;HA=0.5;OD=1.95;';
rawHandler({detail:JSON.stringify({data:snapshot,lang:1,received_at_utc:'2026-08-29T10:00:00.000Z'})});
assert.equal(sent.length,1,'initial FT AH payload not emitted');
let p=sent[0].payload;
assert.equal(sent[0].type,'BET365_REFEREE_UPDATE');
assert.equal(p.schema,'bet365-referee');
assert.equal(p.event_id,'12345');
assert.equal(p.market_id,'MKT1');
assert.equal(p.selection_id,'HOME1|AWAY1');
assert.equal(p.home,'Alpha FC');
assert.equal(p.away,'Beta FC');
assert.equal(p.home_line,'-0.5');
assert.equal(p.away_line,'0.5');
assert.equal(p.home_odds_raw,'1.90');
assert.equal(p.away_odds_raw,'1.95');
assert.equal(p.segment,'FT');

rawHandler({detail:JSON.stringify({data:'\x15C1A_1_3\x01U|TM=61;',lang:1,received_at_utc:'2026-08-29T10:00:05.000Z'})});
assert.equal(sent.length,1,'minute-only update must not refresh price payload');

rawHandler({detail:JSON.stringify({data:'\x15HOME1\x01U|OD=1.91;',lang:1,received_at_utc:'2026-08-29T10:00:10.000Z'})});
assert.equal(sent.length,2,'price update must emit');
p=sent[1].payload;
assert.equal(p.home_odds_raw,'1.91');
assert.equal(p.minute,61);

const localStore=new Map();
let collectorHandler=null;
const observerContext={
  console,Date,Number,String,Set,Map,Math,JSON,
  localStorage:{getItem:k=>localStore.has(k)?localStore.get(k):null,setItem:(k,v)=>localStore.set(k,String(v)),removeItem:k=>localStore.delete(k)},
  document:{documentElement:{dataset:{}}},
  CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},
  window:{addEventListener:(name,fn)=>{if(name==='nomad:bet365-collector-payload')collectorHandler=fn;},dispatchEvent:()=>true}
};
vm.createContext(observerContext);
vm.runInContext(fs.readFileSync(path.join(dir,'..','bet365-observer.js'),'utf8'),observerContext,{filename:'bet365-observer.js'});
const api=observerContext.window.NOMADBET365;
assert.ok(api,'NOMADBET365 missing');
assert.equal(observerContext.document.documentElement.dataset.nomadBet365ObserverReady,'1');
const snap=api.ingestCollector({...p,received_at_utc:new Date().toISOString(),source_timestamp:new Date().toISOString()});
let obs=api.normalizeObservation(snap,30,Date.now());
assert.equal(obs.status,'VALID');
assert.equal(obs.decodedHomeLine,-0.5);
assert.equal(obs.decodedAwayLine,0.5);
assert.equal(obs.homeOddsDecimal,1.91);
assert.equal(obs.awayOddsDecimal,1.95);
assert.equal(api.readForMatch('different-id','Alpha','Beta').eventId,'12345','fuzzy team fallback failed');
const bad=api.collectorToObservation({...p,event_id:'bad',home_line:'-0.5',away_line:'-0.5',received_at_utc:new Date().toISOString(),source_timestamp:new Date().toISOString()});
obs=api.normalizeObservation(bad,30,Date.now());
assert.equal(obs.status,'MISMATCH','same-sign handicap pair must fail closed');
const stale={...snap,observedAt:Date.now()-31000};
obs=api.normalizeObservation(stale,30,Date.now());
assert.equal(obs.status,'STALE');
console.log('Bet365 referee synthetic bridge PASS');

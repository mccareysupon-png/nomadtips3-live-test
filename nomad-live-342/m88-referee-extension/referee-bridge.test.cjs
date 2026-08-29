'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const base='nomad-live-342/m88-referee-extension';

class CustomEvent{
  constructor(type,init={}){this.type=type;this.detail=init.detail}
}
function common(extra={}){
  return {
    console,CustomEvent,Date,Number,String,JSON,Math,Set,Map,WeakSet,Object,Array,Boolean,RegExp,Promise,
    ...extra
  };
}
function run(path,context){
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
}
function fixture(minute=18,homeOdds=0.75,awayOdds=1.07,segment='FT'){
  return {
    league_id:'10007462',sport_id:10,event_id:'14682446',homeName:'Cadiz Mirandilla',awayName:'Club Atletico Central',
    homeScore:0,awayScore:0,period:'1H',minute,
    markets:[{
      marketId:`${segment}HDP_10_14682446_1`,marketType:`${segment} HDP`,homeChoiceId:'501',awayChoiceId:'502',
      homeHDPOri:0.25,awayHDPOri:-0.25,homeOdds,awayOdds,odds_type:'Hong Kong'
    }]
  };
}

async function testMainHook(){
  const emitted=[];
  class MockXHR{
    constructor(){this.listeners={};this.responseType='json';this.response=null}
    addEventListener(name,fn){this.listeners[name]=fn}
    open(){}
    send(){if(this.listeners.load)this.listeners.load()}
  }
  const window={XMLHttpRequest:MockXHR,dispatchEvent:e=>{emitted.push(e);return true}};
  const context=common({window});
  run(`${base}/m88-main-hook.js`,context);

  const x1=new window.XMLHttpRequest();x1.open('POST','/match');x1.response=fixture();x1.send();
  assert.equal(emitted.length,1,'nested FT AH response should emit once');
  const p1=JSON.parse(emitted[0].detail);
  assert.equal(p1.schema,'m88-msports-referee');
  assert.equal(p1.event_id,'14682446');
  assert.equal(p1.market_id,'FTHDP_10_14682446_1');
  assert.equal(p1.selection_id,'home-501|away-502');
  assert.equal(p1.home_line,0.25);
  assert.equal(p1.away_line,-0.25);
  assert.equal(p1.home_odds_raw,0.75);
  assert.equal(p1.segment,'FT');

  const x2=new window.XMLHttpRequest();x2.open('POST','/match');x2.response=fixture(19);x2.send();
  assert.equal(emitted.length,1,'minute-only change must not emit');

  const x3=new window.XMLHttpRequest();x3.open('POST','/match');x3.response=fixture(19,0.76,1.06);x3.send();
  assert.equal(emitted.length,2,'price change for same identity must emit');
  const p2=JSON.parse(emitted[1].detail);
  assert.equal(p2.event_id,p1.event_id);
  assert.equal(p2.market_id,p1.market_id);
  assert.equal(p2.selection_id,p1.selection_id);
  assert.equal(p2.home_odds_raw,0.76);
  return p2;
}

async function testM88Bridge(payload){
  const listeners=new Map(),messages=[];
  const window={addEventListener:(n,fn)=>listeners.set(n,fn)};
  const chrome={runtime:{sendMessage:m=>messages.push(m)}};
  run(`${base}/m88-bridge.js`,common({window,chrome}));
  listeners.get('m88:referee-update')({detail:JSON.stringify(payload)});
  assert.equal(messages.length,1,'FT payload should cross isolated bridge');
  assert.equal(messages[0].type,'M88_REFEREE_UPDATE');
  const fh={...payload,market:{...payload.market,segment:'FH'},market_id:'FHHDP_10_14682446_1'};
  listeners.get('m88:referee-update')({detail:JSON.stringify(fh)});
  assert.equal(messages.length,1,'FH payload must be rejected before final referee path');
  return messages[0].payload;
}

async function testBackground(payload){
  let listener=null,store={},sent=[];
  const chrome={
    storage:{session:{
      get:async key=>({[key]:store[key]}),
      set:async obj=>{store={...store,...obj}}
    }},
    tabs:{
      query:async()=>[{id:7}],
      sendMessage:async(id,msg)=>{sent.push({id,msg})}
    },
    runtime:{onMessage:{addListener:fn=>{listener=fn}}}
  };
  run(`${base}/background.js`,common({chrome}));
  const response=await new Promise(resolve=>listener({type:'M88_REFEREE_UPDATE',payload},null,resolve));
  assert.equal(response.ok,true,'background should accept valid referee payload');
  assert.equal(sent.length,1,'background should relay to NOMAD tab');
  assert.equal(sent[0].msg.type,'M88_REFEREE_PUSH');
  const all=await new Promise(resolve=>listener({type:'M88_REFEREE_GET_ALL'},null,resolve));
  assert.equal(all.ok,true);
  assert.equal(all.payloads.length,1,'background cache should retain event payload');
  assert.equal(all.payloads[0].event_id,'14682446');
  return all.payloads[0];
}

async function testNomadBridge(payload){
  const listeners=new Map(),events=[];
  const window={
    addEventListener:(n,fn)=>listeners.set(n,fn),
    dispatchEvent:e=>{events.push(e);return true}
  };
  const document={readyState:'complete',documentElement:{dataset:{nomadM88ObserverReady:'1'}},addEventListener:()=>{}};
  let runtimePush=null;
  const chrome={runtime:{
    lastError:null,
    sendMessage:(message,cb)=>{if(message.type==='M88_REFEREE_GET_ALL')cb({ok:true,payloads:[payload]})},
    onMessage:{addListener:fn=>{runtimePush=fn}}
  }};
  const context=common({window,document,chrome,setTimeout:fn=>{fn();return 1}});
  run(`${base}/nomad-bridge.js`,context);
  const cached=events.filter(e=>e.type==='nomad:m88-collector-payload');
  assert.equal(cached.length,1,'ready handshake should replay cached payload');
  assert.equal(JSON.parse(cached[0].detail).event_id,'14682446');
  runtimePush({type:'M88_REFEREE_PUSH',payload:{...payload,home_odds_raw:0.77}});
  const pushed=events.filter(e=>e.type==='nomad:m88-collector-payload');
  assert.equal(pushed.length,2,'live background push should reach NOMAD page');
}

(async()=>{
  const fromHook=await testMainHook();
  const bridged=await testM88Bridge(fromHook);
  const cached=await testBackground(bridged);
  await testNomadBridge(cached);
  console.log('Synthetic M88 referee bridge E2E PASS');
})().catch(error=>{console.error(error);process.exit(1)});

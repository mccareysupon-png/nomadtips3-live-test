import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PredictionLedger} from '../src/index.js';

test('browser outbox keeps original entry through failed send, match disappearance and retry; only ack shows LOCKED',async()=>{
  const local=new Map(),session=new Map(),stored=new Map(),sent=[];
  const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)});
  const oneXtwoSettings={
    oddsMin:1.01,
    minuteFrom:1,
    minuteTo:90,
    rollingWindowMinutes:5,
    evidenceRequired:1,
    shotOnTarget:0,
    shotOff:0,
    corner:0,
    dangerousAttackPct:50,
    attackPct:50,
    possessionPct:0,
    scoreTrailingMax:10,
    sideMode:'BOTH',
  };
  local.set('nomad342MarketSettingsActiveV3',JSON.stringify({oneXtwo:oneXtwoSettings}));
  local.set('nomad342MarketRunV3',JSON.stringify({oneXtwo:true,over:false,under:false,updatedAt:Date.now()}));

  const ledger=new PredictionLedger({storage:{async get(k){return stored.get(k);},async put(k,v){stored.set(k,v);},async list(){return stored;},async getAlarm(){return null;},async setAlarm(){},async deleteAlarm(){}}},{});
  let fail=true;
  const document={readyState:'loading',addEventListener(){},querySelectorAll(){return [];},dispatchEvent(){}};
  const window={NOMAD342_MARKET_RUNTIME:{base:'https://test-market'},NOMAD342_LEDGER_RUNTIME:{base:'https://test-ledger'},__nomad342EventResults:[]};
  const sandbox={window,document,localStorage:storage(local),sessionStorage:storage(session),Map,Date,JSON,Math,Number,String,Array,Object,Set,URL,AbortController,CustomEvent:class{},setTimeout(){},clearTimeout(){},fetch:async(url,opts)=>{
    if(url.includes('/candidate'))return new Response(JSON.stringify({
      ok:true,
      provider:'test-market',
      fixture:{id:'fixture-browser-test',minute:35},
      oneXtwo:{home:2,draw:3,away:4},
      totals:{line:2.75,over:2,under:1.8},
      statistics:{
        home:{shotOnTarget:1,shotOff:1,possession:50},
        away:{shotOnTarget:1,shotOff:1,possession:50},
      },
      observedAt:Date.now(),
    }));
    sent.push(JSON.parse(opts.body));if(fail)throw new Error('offline');
    return ledger.lock(new Request(url,{...opts,headers:{...opts.headers,origin:'https://www.nomadtips3.com'}}));
  }};
  let source=fs.readFileSync(new URL('../../../nomad-live-342/api-football-candidate-layer.js',import.meta.url),'utf8');
  source=source.replace(/\}\)\(\);\s*$/,"window.testApi={runOne,flushLedgerOutbox,recoverLockedRows,load,panelHtml};})();");
  vm.runInNewContext(source,sandbox);
  const snapshot=minute=>({minute,observedAt:Date.now(),attacks:[minute,minute],dangerous:[minute,minute],sot:[1,1],off:[1,1],corner:[1,1]});
  const r={m:{id:'browser-test',home:'Home',away:'Away',minute:35,score:[0,1],event:{snapshots:[snapshot(30),snapshot(35)]}},event:{pass:false,metrics:{}}};
  await window.testApi.runOne('browser-test',r);
  assert.match(window.testApi.panelHtml(window.testApi.load()['browser-test']),/SAVING PREDICTION/);
  await window.testApi.flushLedgerOutbox();assert.equal(sent.length,1);
  r.m.minute=80;r.m.score=[4,2];window.__nomad342EventResults=[];
  const queue=JSON.parse(local.get('nomad342LedgerOutboxV2'));queue['browser-test'].nextAt=0;local.set('nomad342LedgerOutboxV2',JSON.stringify(queue));
  fail=false;await window.testApi.flushLedgerOutbox();
  assert.deepEqual(sent[1],sent[0]);assert.equal(sent[1].minute,35);assert.deepEqual(sent[1].entryScore,[0,1]);
  assert.equal(stored.size,1);assert.match(window.testApi.panelHtml(window.testApi.load()['browser-test']),/PREDICTION LOCKED/);
  assert.deepEqual(JSON.parse(local.get('nomad342LedgerOutboxV2')),{});
});

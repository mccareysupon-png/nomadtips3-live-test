import test from 'node:test';
import assert from 'node:assert/strict';
import {CEO_STRATEGY,CEO_VERSION,CEO_PRICE_SETTINGS,ceoCandidatesForFixture,ceoPostPricePass} from '../src/ceo-condition.js';

const t0=1_800_000_000_000;
const snap=(at,minute,{sotH=0,sotA=0,soffH=0,soffA=0,cH=0,cA=0,aH=0,aA=0,dH=0,dA=0,pH=50,pA=50,cardH=0,cardA=0,gH=0,gA=0}={})=>({
  at,minute,shotsOnTarget:{home:sotH,away:sotA},shotsOffTarget:{home:soffH,away:soffA},corners:{home:cH,away:cA},
  attacks:{home:aH,away:aA},dangerousAttacks:{home:dH,away:dA},possession:{home:pH,away:pA},cards:{home:cardH,away:cardA},goals:{home:gH,away:gA}
});

const strongHomeHistory=[
  snap(t0,50),
  snap(t0+5*60_000,55,{sotH:1,soffH:2,cH:1,aH:16,aA:7,dH:9,dA:3,pH:62,pA:38}),
  snap(t0+10*60_000,60,{sotH:3,soffH:5,cH:3,aH:35,aA:13,dH:21,dA:6,pH:65,pA:35})
];
const fixture={fixtureId:'T1',minute:60,goals:{home:0,away:0},events:[]};

test('CEO v1 emits a strong FT AH candidate from existing match history only',()=>{
  const rows=ceoCandidatesForFixture(fixture,strongHomeHistory,['ft_ah']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].strategy,CEO_STRATEGY);
  assert.equal(rows[0].strategyVersion,CEO_VERSION);
  assert.equal(rows[0].market,'ft_ah');
  assert.equal(rows[0].selection,'HOME');
  assert.ok(rows[0].ceoScore>=70);
});

test('CEO v1 stays silent without a complete rolling window',()=>{
  const rows=ceoCandidatesForFixture(fixture,strongHomeHistory.slice(-1),['ft_ah','ft_over']);
  assert.deepEqual(rows,[]);
});

test('CEO v1 price settings cover every requested core market',()=>{
  for(const k of ['ft_1x2','ft_ah','ft_over','ft_under','ht_1x2','ht_ah','ht_over','ht_under','ft_corner_over','ft_corner_under','ht_corner_over','ht_corner_under','ft_corner_ah','ft_cards_over','ft_cards_under','ft_cards_ah','ft_btts_yes','ft_btts_no']) assert.ok(CEO_PRICE_SETTINGS[k],k);
});

test('CEO referee gate accepts consensus and rejects a one-book price',()=>{
  const base={strategy:'CEO',market:'ft_ah',ceoScore:78,price:{line:-0.5,odds:1.82},referee:{validOffers:4,consensusOffers:3,agreementPct:75,offers:[{line:-0.5,odds:1.76},{line:-0.5,odds:1.80},{line:-0.5,odds:1.82},{line:0,odds:1.85}]}};
  assert.equal(ceoPostPricePass(base).pass,true);
  assert.equal(ceoPostPricePass({...base,referee:{validOffers:1,consensusOffers:1,agreementPct:100,offers:[{line:-0.5,odds:1.82}]}}).pass,false);
});


test('CEO v1.1 blocks early-leading FT AH before minute 60',()=>{
  const history=[
    snap(t0,40,{gH:1,gA:0}),
    snap(t0+5*60_000,45,{sotH:1,soffH:2,cH:1,aH:16,aA:7,dH:9,dA:3,pH:62,pA:38,gH:1,gA:0}),
    snap(t0+10*60_000,50,{sotH:3,soffH:5,cH:3,aH:35,aA:13,dH:21,dA:6,pH:65,pA:35,gH:1,gA:0})
  ];
  const rows=ceoCandidatesForFixture({fixtureId:'EARLY-LEAD',minute:50,goals:{home:1,away:0},events:[]},history,['ft_ah']);
  assert.deepEqual(rows,[]);
});

test('CEO v1.1 may evaluate a leading FT AH side from minute 60 onward',()=>{
  const rows=ceoCandidatesForFixture({fixtureId:'LATE-LEAD',minute:60,goals:{home:1,away:0},events:[]},strongHomeHistory,['ft_ah']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].selection,'HOME');
  assert.equal(rows[0].strategyVersion,'1.1');
});

test('CEO v1.1 caps FT live AH at plus/minus 0.5 without tightening other AH markets',()=>{
  assert.equal(CEO_PRICE_SETTINGS.ft_ah.lineMin,-0.5);
  assert.equal(CEO_PRICE_SETTINGS.ft_ah.lineMax,0.5);
  const ft={strategy:'CEO',market:'ft_ah',ceoScore:82,price:{line:-0.75,odds:1.88},referee:{validOffers:4,consensusOffers:3,agreementPct:75,offers:[{line:-0.75,odds:1.84},{line:-0.75,odds:1.86},{line:-0.75,odds:1.88}]}};
  assert.equal(ceoPostPricePass(ft).pass,false);
  assert.equal(ceoPostPricePass(ft).reason,'LINE_RISK');
  const ht={...ft,market:'ht_ah',price:{line:-1,odds:1.88},referee:{validOffers:3,consensusOffers:3,agreementPct:100,offers:[{line:-1,odds:1.84},{line:-1,odds:1.86},{line:-1,odds:1.88}]}};
  assert.equal(ceoPostPricePass(ht).pass,true);
});

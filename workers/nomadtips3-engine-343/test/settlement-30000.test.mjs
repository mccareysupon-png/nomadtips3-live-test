import assert from 'node:assert/strict';
import { MARKET_KEYS, settleMarketSignal } from '../src/market-core.js';

assert.equal(MARKET_KEYS.length,18);

let seed=0x343043;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/0x100000000}
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pick=a=>a[ri(0,a.length-1)];

function split(line){const q=Math.round(Number(line)*4)/4;if(Math.abs(Number(line)-q)>1e-6)return[];return Math.abs(q*2-Math.round(q*2))<1e-8?[q]:[Math.floor(q*2)/2,Math.ceil(q*2)/2]}
function combine(parts){if(!parts.length)return null;if(parts.every(x=>x==='WIN'))return'WIN';if(parts.every(x=>x==='LOSS'))return'LOSS';if(parts.every(x=>x==='PUSH'))return'PUSH';if(parts.includes('WIN')&&parts.includes('PUSH')&&!parts.includes('LOSS'))return'HALF_WIN';if(parts.includes('LOSS')&&parts.includes('PUSH')&&!parts.includes('WIN'))return'HALF_LOSS';return parts.includes('WIN')?'HALF_WIN':'HALF_LOSS'}
function ah(h,a,line,side){const base=side==='HOME'?h-a:a-h;return combine(split(line).map(l=>base+l>0?'WIN':base+l<0?'LOSS':'PUSH'))}
function ou(total,line,side){return combine(split(line).map(l=>side==='OVER'?(total>l?'WIN':total<l?'LOSS':'PUSH'):(total<l?'WIN':total>l?'LOSS':'PUSH')))}
function one(h,a,side){if(side==='DRAW')return h===a?'WIN':'LOSS';if(side==='HOME')return h>a?'WIN':'LOSS';return a>h?'WIN':'LOSS'}
const cp=v=>v.yellow+2*v.red;

function makeCase(market){
  const entry={home:ri(0,3),away:ri(0,3)};
  const final={home:entry.home+ri(0,4),away:entry.away+ri(0,4)};
  const entryHalf={home:ri(0,2),away:ri(0,2)};
  const finalHalf={home:entryHalf.home+ri(0,2),away:entryHalf.away+ri(0,2)};
  const finalCorners={home:ri(0,16),away:ri(0,16),halfHome:ri(0,8),halfAway:ri(0,8)};
  const cards={home:{yellow:ri(0,7),red:ri(0,2)},away:{yellow:ri(0,7),red:ri(0,2)}};
  const goals={home:final.home,away:final.away,halfHome:finalHalf.home,halfAway:finalHalf.away};
  const entryScore={home:entry.home,away:entry.away,halfHome:entryHalf.home,halfAway:entryHalf.away};
  let selection=null,line=null;
  if(market.includes('1x2'))selection=pick(['HOME','DRAW','AWAY']);
  else if(market.endsWith('_ah'))selection=pick(['HOME','AWAY']);
  else if(market.endsWith('_over'))selection='OVER';
  else if(market.endsWith('_under'))selection='UNDER';
  else if(market.endsWith('_yes'))selection='YES';
  else if(market.endsWith('_no'))selection='NO';
  if(market.endsWith('_ah'))line=ri(-16,16)/4;
  else if(market.includes('cards'))line=ri(2,48)/4;
  else if(market.includes('corner'))line=ri(2,60)/4;
  else if(market.includes('over')||market.includes('under'))line=ri(2,32)/4;
  return {signal:{market,selection,line,entryScore},fixture:{goals,corners:finalCorners,cards},entry,entryHalf,final,finalHalf,finalCorners,cards};
}

function oracle(c){const {signal:s,entry,entryHalf,final,finalHalf,finalCorners,cards}=c,m=s.market;
  if(m==='ft_1x2')return one(final.home,final.away,s.selection);
  if(m==='ht_1x2')return one(finalHalf.home,finalHalf.away,s.selection);
  if(m==='ft_ah')return ah(final.home-entry.home,final.away-entry.away,s.line,s.selection);
  if(m==='ht_ah')return ah(finalHalf.home-entryHalf.home,finalHalf.away-entryHalf.away,s.line,s.selection);
  if(m==='ft_over'||m==='ft_under')return ou(final.home+final.away,s.line,s.selection);
  if(m==='ht_over'||m==='ht_under')return ou(finalHalf.home+finalHalf.away,s.line,s.selection);
  if(m==='ft_corner_over'||m==='ft_corner_under')return ou(finalCorners.home+finalCorners.away,s.line,s.selection);
  if(m==='ht_corner_over'||m==='ht_corner_under')return ou(finalCorners.halfHome+finalCorners.halfAway,s.line,s.selection);
  if(m==='ft_corner_ah')return ah(finalCorners.home,finalCorners.away,s.line,s.selection);
  if(m==='ft_cards_over'||m==='ft_cards_under')return ou(cp(cards.home)+cp(cards.away),s.line,s.selection);
  if(m==='ft_cards_ah')return ah(cp(cards.home),cp(cards.away),s.line,s.selection);
  const yes=final.home>0&&final.away>0;
  if(m==='ft_btts_yes')return yes?'WIN':'LOSS';
  if(m==='ft_btts_no')return yes?'LOSS':'WIN';
  throw new Error(`oracle missing ${m}`);
}

// Regression from the real bad ledger example: entry 0-2, no more goals, Away 0 = PUSH.
assert.equal(settleMarketSignal({market:'ft_ah',selection:'AWAY',line:0,entryScore:{home:0,away:2}},{goals:{home:0,away:2}}),'PUSH');
// Bet365 card points: Yellow=1, Red=2.
assert.equal(settleMarketSignal({market:'ft_cards_over',selection:'OVER',line:3.5},{cards:{home:{yellow:1,red:1},away:{yellow:1,red:0}}}),'WIN');

const N=30000,counts=Object.fromEntries(MARKET_KEYS.map(k=>[k,0]));
for(let i=0;i<N;i++){
  const market=MARKET_KEYS[i%MARKET_KEYS.length],c=makeCase(market),expected=oracle(c),actual=settleMarketSignal(c.signal,c.fixture);
  counts[market]++;
  assert.equal(actual,expected,`case=${i} market=${market} expected=${expected} actual=${actual} data=${JSON.stringify(c)}`);
}
console.log('settlement-30000 ok',N,counts);

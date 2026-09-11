export const MARKET_RULES = Object.freeze({
  ft_1x2: { label:'1X2 · Full Time', group:'FULL TIME', provider:'1x2', aliases:['1x2'], kind:'1X2', period:'FT', sideMode:true },
  ft_ah: { label:'Asian Handicap · Full Time', group:'FULL TIME', provider:'asian', aliases:['asian_handicap','asian'], kind:'AH', period:'FT', sideMode:true },
  ft_over: { label:'Goals OVER · Full Time', group:'FULL TIME', provider:'goalline', aliases:['goal_line','goalline'], kind:'OU', period:'FT', selection:'OVER', basis:'goals', gap:true },
  ft_under: { label:'Goals UNDER · Full Time', group:'FULL TIME', provider:'goalline', aliases:['goal_line','goalline'], kind:'OU', period:'FT', selection:'UNDER', basis:'goals' },

  ht_1x2: { label:'1X2 · 1st Half', group:'FIRST HALF', provider:'1x2_half', aliases:['1x2_half'], kind:'1X2', period:'HT', sideMode:true },
  ht_ah: { label:'Asian Handicap · 1st Half', group:'FIRST HALF', provider:'asian_half', aliases:['asian_handicap_half','asian_half'], kind:'AH', period:'HT', sideMode:true },
  ht_over: { label:'Goals OVER · 1st Half', group:'FIRST HALF', provider:'goalline_half', aliases:['goal_line_half','goalline_half'], kind:'OU', period:'HT', selection:'OVER', basis:'goals', gap:true },
  ht_under: { label:'Goals UNDER · 1st Half', group:'FIRST HALF', provider:'goalline_half', aliases:['goal_line_half','goalline_half'], kind:'OU', period:'HT', selection:'UNDER', basis:'goals' },

  ft_corner_over: { label:'Corners OVER · Full Time', group:'CORNERS', provider:'corner', aliases:['corner_line','corner'], kind:'OU', period:'FT', selection:'OVER', basis:'corners', gap:true },
  ft_corner_under: { label:'Corners UNDER · Full Time', group:'CORNERS', provider:'corner', aliases:['corner_line','corner'], kind:'OU', period:'FT', selection:'UNDER', basis:'corners' },
  ht_corner_over: { label:'Corners OVER · 1st Half', group:'CORNERS', provider:'corner_half', aliases:['corner_line_half','corner_half'], kind:'OU', period:'HT', selection:'OVER', basis:'corners', gap:true },
  ht_corner_under: { label:'Corners UNDER · 1st Half', group:'CORNERS', provider:'corner_half', aliases:['corner_line_half','corner_half'], kind:'OU', period:'HT', selection:'UNDER', basis:'corners' },
  ft_corner_ah: { label:'Corner Asian Handicap', group:'CORNERS', provider:'corner_asian', aliases:['corner_asian'], kind:'AH', period:'FT', sideMode:true, basis:'corners' },

  ft_cards_over: { label:'Cards OVER · Full Time', group:'CARDS & BTTS', provider:'cards', aliases:['card_line','cards'], kind:'OU', period:'FT', selection:'OVER', basis:'cards', gap:true },
  ft_cards_under: { label:'Cards UNDER · Full Time', group:'CARDS & BTTS', provider:'cards', aliases:['card_line','cards'], kind:'OU', period:'FT', selection:'UNDER', basis:'cards' },
  ft_cards_ah: { label:'Card Asian Handicap', group:'CARDS & BTTS', provider:'cards_asian', aliases:['card_asian','cards_asian'], kind:'AH', period:'FT', sideMode:true, basis:'cards' },
  ft_btts_yes: { label:'BTTS · YES', group:'CARDS & BTTS', provider:'btts', aliases:['btts'], kind:'BTTS', period:'FT', selection:'YES' },
  ft_btts_no: { label:'BTTS · NO', group:'CARDS & BTTS', provider:'btts', aliases:['btts'], kind:'BTTS', period:'FT', selection:'NO' }
});

export const MARKET_KEYS = Object.freeze(Object.keys(MARKET_RULES));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};
const halfPair=v=>v&&typeof v==='object'?{home:num(v.halfHome??v.half_home),away:num(v.halfAway??v.half_away)}:{home:null,away:null};
const pairReady=p=>num(p?.home)!==null&&num(p?.away)!==null;

export function splitAsianLine(line){
  const n=Number(line);
  if(!Number.isFinite(n)) return [];
  const q=Math.round(n*4)/4;
  if(Math.abs(n-q)>1e-6) return [];
  if(Math.abs(q*2-Math.round(q*2))<1e-8) return [q];
  return [Math.floor(q*2)/2,Math.ceil(q*2)/2];
}

export function combineAsianParts(parts){
  if(!parts.length) return null;
  if(parts.every(x=>x==='WIN')) return 'WIN';
  if(parts.every(x=>x==='LOSS')) return 'LOSS';
  if(parts.every(x=>x==='PUSH')) return 'PUSH';
  if(parts.includes('WIN')&&parts.includes('PUSH')&&!parts.includes('LOSS')) return 'HALF_WIN';
  if(parts.includes('LOSS')&&parts.includes('PUSH')&&!parts.includes('WIN')) return 'HALF_LOSS';
  return parts.includes('WIN') ? 'HALF_WIN' : 'HALF_LOSS';
}

export function settleOu(total,line,selection){
  if(!Number.isFinite(Number(total))||!Number.isFinite(Number(line))) return null;
  const t=Number(total),sel=String(selection||'').toUpperCase(),parts=splitAsianLine(line);
  if(!parts.length||!['OVER','UNDER'].includes(sel))return null;
  return combineAsianParts(parts.map(l=>{
    if(sel==='OVER') return t>l?'WIN':t<l?'LOSS':'PUSH';
    return t<l?'WIN':t>l?'LOSS':'PUSH';
  }));
}

export function settleAh(homeValue,awayValue,line,selection){
  if(!Number.isFinite(Number(homeValue))||!Number.isFinite(Number(awayValue))||!Number.isFinite(Number(line))) return null;
  const sel=String(selection||'').toUpperCase(),parts=splitAsianLine(line);
  if(!parts.length||!['HOME','AWAY'].includes(sel))return null;
  const base=sel==='HOME'?Number(homeValue)-Number(awayValue):Number(awayValue)-Number(homeValue);
  return combineAsianParts(parts.map(l=>base+l>0?'WIN':base+l<0?'LOSS':'PUSH'));
}

export function settle1x2(homeValue,awayValue,selection){
  const h=num(homeValue),a=num(awayValue),sel=String(selection||'').toUpperCase();
  if(h===null||a===null||!['HOME','DRAW','AWAY'].includes(sel))return null;
  if(sel==='DRAW')return h===a?'WIN':'LOSS';
  if(sel==='HOME')return h>a?'WIN':'LOSS';
  return a>h?'WIN':'LOSS';
}

export function cardPointsSide(v){
  if(!v||typeof v!=='object')return null;
  const yellow=num(v.yellow),red=num(v.red);
  if(yellow===null&&red===null)return null;
  return (yellow??0)+2*(red??0);
}

export function cardPointsPair(cards){
  return {home:cardPointsSide(cards?.home),away:cardPointsSide(cards?.away)};
}

function periodPair(v,period,{entryFallback=false}={}){
  if(period!=='HT')return pair(v);
  const half=halfPair(v);
  if(pairReady(half))return half;
  return entryFallback?pair(v):half;
}
function basisPair(f,def,{entryFallback=false}={}){
  if(def.basis==='corners')return periodPair(f?.corners,def.period,{entryFallback});
  if(def.basis==='cards')return cardPointsPair(f?.cards);
  return periodPair(f?.goals,def.period,{entryFallback});
}
function subtractPair(finalPair,entryPair){
  const fh=num(finalPair?.home),fa=num(finalPair?.away),eh=num(entryPair?.home),ea=num(entryPair?.away);
  if([fh,fa,eh,ea].some(v=>v===null))return {home:null,away:null};
  const home=fh-eh,away=fa-ea;
  if(home<0||away<0)return {home:null,away:null};
  return {home,away};
}

// Bet365 settlement rules used by NOMAD 3.43:
// - live goal Asian Handicap ignores goals scored before Entry;
// - live Goal Line includes all goals in the relevant period;
// - Asian corners/card handicaps use final period totals;
// - card totals score Yellow=1, Red=2.
export function settleMarketSignal(signal,fixture){
  const def=MARKET_RULES[signal?.market];
  if(!def||!fixture)return null;
  if(def.kind==='1X2'){
    const p=basisPair(fixture,{basis:'goals',period:def.period});
    return settle1x2(p.home,p.away,signal.selection);
  }
  if(def.kind==='AH'){
    let p=basisPair(fixture,def);
    if((def.basis||'goals')==='goals'){
      const entryFixture={goals:signal?.entryScore??signal?.scoreAt??null};
      const entry=basisPair(entryFixture,{basis:'goals',period:def.period},{entryFallback:true});
      p=subtractPair(p,entry);
    }
    return settleAh(p.home,p.away,signal.line,signal.selection);
  }
  if(def.kind==='OU'){
    const p=basisPair(fixture,def);
    if(!pairReady(p))return null;
    return settleOu(Number(p.home)+Number(p.away),signal.line,signal.selection);
  }
  if(def.kind==='BTTS'){
    const p=pair(fixture?.goals),h=num(p.home),a=num(p.away),sel=String(signal.selection||'').toUpperCase();
    if(h===null||a===null||!['YES','NO'].includes(sel))return null;
    const yes=h>0&&a>0;
    return sel==='YES'?(yes?'WIN':'LOSS'):(yes?'LOSS':'WIN');
  }
  return null;
}

export function lineGap(line,currentTotal){
  const l=Number(line),t=Number(currentTotal);
  if(!Number.isFinite(l)||!Number.isFinite(t)) return null;
  return Math.round((l-t)*100)/100;
}

export function gapPass(line,currentTotal,maxGap){
  const gap=lineGap(line,currentTotal),cap=Number(maxGap);
  if(gap===null||!Number.isFinite(cap)) return false;
  if(cap>=999) return gap>=0;
  return gap>=0&&gap<=cap+1e-9;
}

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

export function splitAsianLine(line){
  const q=Math.round(Number(line)*4)/4;
  if(!Number.isFinite(q)) return [];
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
  const t=Number(total),sel=String(selection||'').toUpperCase();
  return combineAsianParts(splitAsianLine(line).map(l=>{
    if(sel==='OVER') return t>l?'WIN':t<l?'LOSS':'PUSH';
    return t<l?'WIN':t>l?'LOSS':'PUSH';
  }));
}

export function settleAh(homeValue,awayValue,line,selection){
  if(!Number.isFinite(Number(homeValue))||!Number.isFinite(Number(awayValue))||!Number.isFinite(Number(line))) return null;
  const base=String(selection||'').toUpperCase()==='HOME'?Number(homeValue)-Number(awayValue):Number(awayValue)-Number(homeValue);
  return combineAsianParts(splitAsianLine(line).map(l=>base+l>0?'WIN':base+l<0?'LOSS':'PUSH'));
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

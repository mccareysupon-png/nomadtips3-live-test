(()=>{
'use strict';

const DEFINITIONS=Object.freeze({
  ft_1x2:{key:'ft_1x2',family:'1x2',label:'1X2 · Full Time',short:'FT 1X2',period:'FT',kind:'1X2',provider:'1x2',aliases:['1x2'],sideMode:'HOME_DRAW_AWAY'},
  ft_ah:{key:'ft_ah',family:'ah',label:'Asian Handicap · Full Time',short:'FT AH',period:'FT',kind:'AH',provider:'asian',aliases:['asian_handicap','asian'],sideMode:'HOME_AWAY',line:true},
  ft_over:{key:'ft_over',family:'ou',label:'Goals OVER · Full Time',short:'FT Over',period:'FT',kind:'OU',provider:'goalline',aliases:['goal_line','goalline'],selection:'OVER',basis:'goals',line:true},
  ft_under:{key:'ft_under',family:'ou',label:'Goals UNDER · Full Time',short:'FT Under',period:'FT',kind:'OU',provider:'goalline',aliases:['goal_line','goalline'],selection:'UNDER',basis:'goals',line:true},

  ht_1x2:{key:'ht_1x2',family:'1x2',label:'1X2 · 1st Half',short:'1H 1X2',period:'HT',kind:'1X2',provider:'1x2_half',aliases:['1x2_half'],sideMode:'HOME_DRAW_AWAY'},
  ht_ah:{key:'ht_ah',family:'ah',label:'Asian Handicap · 1st Half',short:'1H AH',period:'HT',kind:'AH',provider:'asian_half',aliases:['asian_handicap_half','asian_half'],sideMode:'HOME_AWAY',line:true},
  ht_over:{key:'ht_over',family:'ou',label:'Goals OVER · 1st Half',short:'1H Over',period:'HT',kind:'OU',provider:'goalline_half',aliases:['goal_line_half','goalline_half'],selection:'OVER',basis:'goals',line:true},
  ht_under:{key:'ht_under',family:'ou',label:'Goals UNDER · 1st Half',short:'1H Under',period:'HT',kind:'OU',provider:'goalline_half',aliases:['goal_line_half','goalline_half'],selection:'UNDER',basis:'goals',line:true},

  ft_corner_over:{key:'ft_corner_over',family:'corners',label:'Corners OVER · Full Time',short:'FT Corner Over',period:'FT',kind:'OU',provider:'corner',aliases:['corner_line','corner'],selection:'OVER',basis:'corners',line:true},
  ft_corner_under:{key:'ft_corner_under',family:'corners',label:'Corners UNDER · Full Time',short:'FT Corner Under',period:'FT',kind:'OU',provider:'corner',aliases:['corner_line','corner'],selection:'UNDER',basis:'corners',line:true},
  ht_corner_over:{key:'ht_corner_over',family:'corners',label:'Corners OVER · 1st Half',short:'1H Corner Over',period:'HT',kind:'OU',provider:'corner_half',aliases:['corner_line_half','corner_half'],selection:'OVER',basis:'corners',line:true},
  ht_corner_under:{key:'ht_corner_under',family:'corners',label:'Corners UNDER · 1st Half',short:'1H Corner Under',period:'HT',kind:'OU',provider:'corner_half',aliases:['corner_line_half','corner_half'],selection:'UNDER',basis:'corners',line:true},
  ft_corner_ah:{key:'ft_corner_ah',family:'corners',label:'Corner Asian Handicap',short:'FT Corner AH',period:'FT',kind:'AH',provider:'corner_asian',aliases:['corner_asian'],sideMode:'HOME_AWAY',basis:'corners',line:true},

  ft_cards_over:{key:'ft_cards_over',family:'cards',label:'Cards OVER · Full Time',short:'FT Cards Over',period:'FT',kind:'OU',provider:'cards',aliases:['card_line','cards'],selection:'OVER',basis:'cards',line:true},
  ft_cards_under:{key:'ft_cards_under',family:'cards',label:'Cards UNDER · Full Time',short:'FT Cards Under',period:'FT',kind:'OU',provider:'cards',aliases:['card_line','cards'],selection:'UNDER',basis:'cards',line:true},
  ft_cards_ah:{key:'ft_cards_ah',family:'cards',label:'Card Asian Handicap',short:'FT Cards AH',period:'FT',kind:'AH',provider:'cards_asian',aliases:['card_asian','cards_asian'],sideMode:'HOME_AWAY',basis:'cards',line:true},
  ft_btts_yes:{key:'ft_btts_yes',family:'btts',label:'BTTS · YES',short:'BTTS Yes',period:'FT',kind:'BTTS',provider:'btts',aliases:['btts'],selection:'YES'},
  ft_btts_no:{key:'ft_btts_no',family:'btts',label:'BTTS · NO',short:'BTTS No',period:'FT',kind:'BTTS',provider:'btts',aliases:['btts'],selection:'NO'}
});

const FAMILIES=Object.freeze({
  all:{id:'all',label:'Total',title:'Total · All Markets'},
  '1x2':{id:'1x2',label:'1X2',title:'1X2 · Match Result'},
  ah:{id:'ah',label:'AH',title:'Asian Handicap'},
  ou:{id:'ou',label:'O/U',title:'Goals · Over / Under'},
  btts:{id:'btts',label:'BTTS',title:'Both Teams To Score'},
  corners:{id:'corners',label:'Corners',title:'Corner Markets'},
  cards:{id:'cards',label:'Cards',title:'Card Markets'},
  other:{id:'other',label:'Other',title:'Other Markets'}
});

const KEYS=Object.freeze(Object.keys(DEFINITIONS));
const norm=v=>String(v??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
const aliasIndex=new Map();
for(const d of Object.values(DEFINITIONS)){
  aliasIndex.set(norm(d.key),d.key);
  aliasIndex.set(norm(d.provider),d.key);
  for(const a of d.aliases||[]) if(!aliasIndex.has(norm(a))) aliasIndex.set(norm(a),d.key);
}

function exactKey(value){const n=norm(value);return DEFINITIONS[n]?n:null}
function resolve(rowOrKey){
  if(typeof rowOrKey==='string') return DEFINITIONS[exactKey(rowOrKey)]||null;
  const r=rowOrKey||{};
  const direct=exactKey(r.market)||exactKey(r.marketKey)||exactKey(r.ruleKey);
  if(direct) return DEFINITIONS[direct];
  const raw=norm(r.providerMarket||r.marketLabel||r.market||'');
  const selection=String(r.selection||r.pick||'').toUpperCase();
  const period=String(r.period||'').toUpperCase();
  const label=String(r.marketLabel||r.providerMarket||r.market||'').toLowerCase();
  const half=period==='HT'||/1st half|first half|half|_half/.test(label);
  if(/corner/.test(label)){
    if(/asian|handicap|\bah\b/.test(label))return DEFINITIONS.ft_corner_ah;
    if(selection.includes('UNDER')||/under/.test(label))return DEFINITIONS[half?'ht_corner_under':'ft_corner_under'];
    return DEFINITIONS[half?'ht_corner_over':'ft_corner_over'];
  }
  if(/card/.test(label)){
    if(/asian|handicap|\bah\b/.test(label))return DEFINITIONS.ft_cards_ah;
    if(selection.includes('UNDER')||/under/.test(label))return DEFINITIONS.ft_cards_under;
    return DEFINITIONS.ft_cards_over;
  }
  if(/btts|both teams/.test(label))return DEFINITIONS[(selection==='NO'||/\bno\b/.test(label))?'ft_btts_no':'ft_btts_yes'];
  if(/asian|handicap|\bah\b/.test(label))return DEFINITIONS[half?'ht_ah':'ft_ah'];
  if(/1x2|match result|moneyline|winner|3way|three way/.test(label))return DEFINITIONS[half?'ht_1x2':'ft_1x2'];
  if(/over|under|goal.?line|goalline|total/.test(label)){
    const under=selection.includes('UNDER')||/under/.test(label);
    return DEFINITIONS[half?(under?'ht_under':'ht_over'):(under?'ft_under':'ft_over')];
  }
  const aliased=aliasIndex.get(raw);
  return aliased?DEFINITIONS[aliased]:null;
}
function familyOf(rowOrKey){return resolve(rowOrKey)?.family||'other'}
function variants(family){return KEYS.map(k=>DEFINITIONS[k]).filter(d=>family==='all'||d.family===family)}
function conditionSchema(key){
  const d=resolve(key); if(!d)return null;
  return Object.freeze({market:d.key,family:d.family,period:d.period,kind:d.kind,basis:d.basis||'goals',selection:d.selection||null,sideMode:d.sideMode||null,line:Boolean(d.line),dimensions:['minute','score','events','statistics','odds','bookmaker','priceAge']});
}

window.BALL46_MARKET_REGISTRY=Object.freeze({version:'343-market-registry-v1',definitions:DEFINITIONS,families:FAMILIES,keys:KEYS,resolve,familyOf,variants,conditionSchema});
})();

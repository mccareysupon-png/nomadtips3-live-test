// Immutable signal-contract metadata for the five Corners rules.
// These are market configurations, NOT proof of which upstream odds alias
// was actually present in a specific 5DollarFootballAPI response.
export const CORNER_RULES=Object.freeze({
  ft_corner_over:Object.freeze({family:'TOTAL_OU',title:'TOTAL CORNERS · OVER',period:'FT',marketRoute:'corner_line → corner',scope:'Both teams · combined corners'}),
  ft_corner_under:Object.freeze({family:'TOTAL_OU',title:'TOTAL CORNERS · UNDER',period:'FT',marketRoute:'corner_line → corner',scope:'Both teams · combined corners'}),
  ht_corner_over:Object.freeze({family:'TOTAL_OU',title:'1H TOTAL CORNERS · OVER',period:'HT',marketRoute:'corner_line_half → corner_half',scope:'Both teams · first-half combined corners'}),
  ht_corner_under:Object.freeze({family:'TOTAL_OU',title:'1H TOTAL CORNERS · UNDER',period:'HT',marketRoute:'corner_line_half → corner_half',scope:'Both teams · first-half combined corners'}),
  ft_corner_ah:Object.freeze({family:'CORNER_HANDICAP',title:'CORNER ASIAN HANDICAP',period:'FT',marketRoute:'corner_asian',scope:'Selected team · corners difference vs opponent'})
});
export function cornerRuleForSignal(row){
  const key=String(row?.market??row?.sourceMarket??'').toLowerCase().trim();
  const rule=CORNER_RULES[key];
  if(!rule)return {key,family:'UNVERIFIED',title:'CORNERS · RULE UNVERIFIED',
    period:null,marketRoute:null,scope:'Source rule key not recognized'};
  return {key,...rule};
}

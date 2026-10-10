// 5USD market keys: corner_line = total O/U; corner_asian = handicap.
// Neither a decimal line nor corner_line proves Bet365's Asian Total menu.
const labels={ASIAN_TOTAL:'ASIAN TOTAL',STANDARD_TOTAL:'STANDARD TOTAL',
 TOTAL_OU:'TOTAL O/U',CORNER_HANDICAP:'CORNER HANDICAP',
 TEAM_CORNERS:'TEAM CORNERS',CONFLICT:'SOURCE CONFLICT',UNVERIFIED:'UNVERIFIED'};
const plain=x=>String(x??'').toLowerCase().replace(/[_/-]+/g,' ').replace(/\s+/g,' ').trim();
export function classifyCornerMarket(row){
 const values=[row?.providerMarket,row?.marketLabel,row?.market,row?.marketName,
  row?.providerMarketName].filter(s=>typeof s==='string'&&s.trim());
 const overUnder=/\b(over|under)\b/.test(plain(row?.selection));
 const kinds=new Set();
 for(const val of values){
  const x=plain(val);
  if(!/\bcorners?\b/.test(x))continue;
  if(/\b(handicap|spread|hcap)\b/.test(x)||/\bcorner asian\b/.test(x))
   kinds.add('CORNER_HANDICAP');
  else if(/\b(team|individual|home|away)\s+(total\s+)?corners?\b|\bcorners?\s+(home|away|by team)\b/.test(x))
   kinds.add('TEAM_CORNERS');
  else if(/\b(asian total corners?|asian corners?\s+(over|under|o u|total)|asian over under corners?)\b/.test(x)||
   (/\basian corners?\b/.test(x)&&overUnder))
   kinds.add('ASIAN_TOTAL');
  else if(/\b(standard|regular|ordinary|non asian)\b/.test(x))
   kinds.add('STANDARD_TOTAL');
  else if(/\b(corner line|total corners?|corners? total|corners?\s+(ou|o u|over|under))\b/.test(x))
   kinds.add('TOTAL_OU');
 }
 if([...kinds].some(k=>k!=='TOTAL_OU'))kinds.delete('TOTAL_OU');
 const types=[...kinds];
 const type=types.length>1?'CONFLICT':types[0]||'UNVERIFIED';
 const reasons={
  ASIAN_TOTAL:'Asian Total Corners is explicitly named by the source.',
  STANDARD_TOTAL:'Standard Total Corners is explicitly named by the source.',
  TOTAL_OU:'Total Corners O/U; Asian versus standard bookmaker presentation unconfirmed.',
  CORNER_HANDICAP:'Asian Corner Handicap is not Asian Total Corners.',
  TEAM_CORNERS:'Single-team corners, not combined total.',
  CONFLICT:'Conflicting source categories; further inspection required.',
  UNVERIFIED:'Source type missing; line decimal is not proof of an Asian market.'
 };
 return {type,label:labels[type],reason:reasons[type],source:values.join(' | ').slice(0,280)};
}

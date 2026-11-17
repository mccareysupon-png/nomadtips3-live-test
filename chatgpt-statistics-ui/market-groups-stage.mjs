// STAGING only: group canonical raw keys without changing settlement formulas.
export function marketGroup(raw){
 const k=String(raw??'').trim().toLowerCase();
 if(!k)throw Error('MARKET_KEY_MISSING');
 if(/corner/.test(k))return 'Corners';
 if(/card/.test(k))return 'Cards';
 if(/btts|both_teams_to_score/.test(k))return 'BTTS';
 if(/(?:^|_)ah(?:_|$)/.test(k))return 'AH';
 if(/(?:^|_)1x2(?:_|$)/.test(k))return '1X2';
 if(/(?:^|_)(over|under|ou)(?:_|$)/.test(k))return 'O/U';
 return 'Other';
}
export const MARKET_GROUPS=['AH','1X2','O/U','Corners','BTTS','Cards','Other'];

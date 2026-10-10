// Isolated quote gate for goal totals and corner totals only.
// Never reuse opening/closing, goal_line_fixed, alternate market aliases,
// or a bookmaker whose identity has not been verified from the API wrapper.
const MAIN_OU_FIELDS=Object.freeze({
  ft_over:"goal_line",
  ft_under:"goal_line",
  ht_over:"goal_line_half",
  ht_under:"goal_line_half",
  ft_corner_over:"corner_line",
  ft_corner_under:"corner_line",
  ht_corner_over:"corner_line_half",
  ht_corner_under:"corner_line_half"
});
const finite=value=>value===null||value===undefined||value===""||typeof value==="boolean"||!Number.isFinite(Number(value))?null:Number(value);
const quarterLine=line=>Math.abs(line*4-Math.round(line*4))<1e-7;

export const isGuardedOuMarket=key=>Object.prototype.hasOwnProperty.call(MAIN_OU_FIELDS,key);
export const requiredInplayField=key=>MAIN_OU_FIELDS[key]??null;

export function strictOuQuote(root,key,selection){
  if(!isGuardedOuMarket(key)||root?.__verifiedBet365!==true)return null;
  const expectedSide=key.endsWith("_over")?"OVER":"UNDER";
  if(selection!==expectedSide)return null;
  const market=root?.[MAIN_OU_FIELDS[key]];
  // Require *exact* canonical main-market field and *exact* live stage.
  const live=market?.inplay;
  if(!live||typeof live!=="object"||Array.isArray(live)||live.suspended===true)return null;
  const line=finite(live.line),odds=finite(live[expectedSide.toLowerCase()]);
  if(line===null||line<0||!quarterLine(line)||odds===null||odds<=1)return null;
  return {line,providerLine:line,odds};
}

// Fail closed when fixture totals are missing. A quote on/below the
// current accumulated total is non-actionable for regular in-play totals.
export function mainOuTotalPass(price,currentTotal){
  const line=finite(price?.line),total=finite(currentTotal);
  return line!==null&&total!==null&&total>=0&&line>total;
}

// The 5USD endpoint supplies a bookmaker array. If its selected odds
// object is not explicitly bet365, reject it for the guarded OU markets.
// Other markets retain their existing legacy behavior.
export function verifiedBet365Odds(payload,chosenOdds){
  const books=payload?.data?.bookmakers??payload?.bookmakers;
  if(!Array.isArray(books)||!chosenOdds||typeof chosenOdds!=="object")return false;
  return books.some(book=>book?.odds===chosenOdds&&
    String(book?.slug??book?.name??"").toLowerCase().replace(/[\s_-]/g,"")==="bet365");
}

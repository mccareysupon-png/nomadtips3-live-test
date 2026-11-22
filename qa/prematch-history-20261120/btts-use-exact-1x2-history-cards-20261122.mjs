// BALL46 TEST: 1X2 Statistics Prediction History is the one and only
// renderer for BTTS screening candidate cards. Same premiumMatchRow,
// same DOM/classes, same responsive CSS. No duplicate card-design system.
export const B46_BTTS_CLONED_1X2_PREDICTION_CARDS_V1='B46_BTTS_CLONED_1X2_PREDICTION_CARDS_V1';
function exactOnce(s,anchor,replacement,label){
 const n=s.split(anchor).length-1;
 if(n!==1)throw Error('BTTS_1X2_CARD_CLONE_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(anchor,replacement);
}
function clonedBttsCandidateCard(r){
  // Only an ephemeral view adapter. A screening candidate is NEVER saved
  // as an issued BTTS prediction or included in Total/WinRate/P&L.
  const choice=bttsCandidateProb(r);
  const source={
    fixture_id:Number(r.fixtureId),market:'BTTS',
    home:r.home||'Home',away:r.away||'Away',
    league:r.leagueName||'League unavailable',
    kickoff:Number(r.kickoff)||0,
    status:'PENDING',price:null,pick:choice?.side==='NO'?'BTTS_NO':'BTTS_YES',
    probability:choice?.p??null,edge:null,ev:null,
    home_count:Number(r.homeHistory)||0,away_count:Number(r.awayHistory)||0
  };
  // IMPORTANT: the very same function that builds each real 1X2
  // Statistics > Prediction History card, not a visual recreation.
  const card=premiumMatchRow(source,null,false);
  card.classList.add('b46pm-btts-screen-card');
  card.dataset.b46BttsCandidateFixture=String(r.fixtureId);
  card.setAttribute('aria-label','BTTS pre-price screening candidate, not a published prediction');
  const pick=card.querySelector('.b46pm-premium-pick');
  if(pick){
    const small=pick.querySelector('.b46pm-premium-tiny');
    if(small)small.textContent='BTTS · SCREENING ONLY';
    const strong=pick.querySelector('strong');
    if(strong)strong.textContent=choice?.side==='NO'?'BTTS NO':'BTTS YES';
    // Price is not offered, so do not expose the original priced-pick badge.
    pick.querySelector('.b46pm-premium-odds')?.remove();
  }
  const status=card.querySelector('.b46pm-premium-status');
  if(status){
    status.replaceChildren(el('span','b46pm-state pending',
      r.status==='NOT_OFFERED'?'BET365 · NOT OFFERED':'BET365 · PRICE NEEDED'));
  }
  const metadata=card.querySelector('.b46pm-premium-meta');
  if(metadata){
    const time=el('time','b46pm-state b46pm-premium-screen-time',bttsCandidateDate(r.kickoff));
    if(Number.isFinite(Number(r.kickoff))&&Number(r.kickoff)>0)
      time.dateTime=new Date(Number(r.kickoff)*1000).toISOString();
    metadata.append(time);
  }
  // Only the shared 1X2 card's native probability/history metrics stay
  // meaningful here. Its EDGE/EV placeholders remain dashes until price.
  return card;
}
function clonedBttsContainerCss(){
  // Current BTTS section used a different TWO-COLUMN card-design system.
  // One card per full row is essential for inheriting the original 1X2
  // full-width multi-column premium card geometry.
  return [
    '/* BTTS screening cards use the EXACT 1X2 premiumMatchRow DOM and CSS */',
    '#b46pm-btts-candidates{display:block!important;min-width:0!important;width:100%!important;max-width:100%!important}',
    '#b46pm-btts-candidates>.b46pm-list-head{display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:space-between!important;gap:8px 16px!important;margin-bottom:12px!important}',
    '#b46pm-btts-candidates>.b46pm-match{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin-bottom:12px!important}',
    '#b46pm-btts-candidates>.b46pm-empty{margin:12px 0!important}',
    '#b46pm-btts-candidates .b46pm-premium-screen-time{white-space:nowrap!important;font-size:11px!important;opacity:.8!important}',
    '@media(max-width:680px){#b46pm-btts-candidates .b46pm-premium-screen-time{white-space:normal!important}}'
  ].join('\n');
}
export function patchBttsCloneExactOneX2Cards(client){
  if(typeof client!=='string'||
    !client.includes("function premiumMatchRow(item,hub,stale){")||
    !client.includes("function makeBttsCandidateCard(r){")||
    !client.includes("function bttsLayoutCssV2(){")||
    !client.includes("function makeBttsCandidatesSection(){")||
    !client.includes("b46pm-btts-candidates")){
    throw Error('EXPECTED_EXISTING_1X2_AND_BTTS_TEST_CLIENT_NOT_FOUND');
  }
  let result=client;
  const oldRendererStart='function makeBttsCandidateCard(r){';
  const oldStyleStart='function bttsLayoutCssV2(){';
  const oldSectionStart='function makeBttsCandidatesSection(){';
  const cardPos=result.indexOf(oldRendererStart),cssPos=result.indexOf(oldStyleStart,cardPos),
     sectionPos=result.indexOf(oldSectionStart,cssPos);
  if(cardPos<0||cssPos<=cardPos||sectionPos<=cssPos||
    result.indexOf(oldRendererStart,cardPos+1)!==-1||
    result.indexOf(oldStyleStart,cssPos+1)!==-1||
    result.indexOf(oldSectionStart,sectionPos+1)!==-1)
    throw Error('BTTS_RENDERER_AND_CSS_FUNCTION_BOUNDARY_DRIFT');
  const cardFunc=clonedBttsCandidateCard.toString()
     .replace('function clonedBttsCandidateCard','function makeBttsCandidateCard');
  const cssFunc=clonedBttsContainerCss.toString()
     .replace('function clonedBttsContainerCss','function bttsLayoutCssV2');
  result=result.slice(0,cardPos)+cardFunc+'\n  '+cssFunc+'\n  '+result.slice(sectionPos);
  // Preserve everything: filtering, actual provider response, list pagination,
  // all 1X2/BTTS issued ledger data and market snapshot calculations.
  if(!result.includes('const card=premiumMatchRow(source,null,false)')||
    !result.includes("small.textContent='BTTS · SCREENING ONLY'")||
    !result.includes("status.replaceChildren(el('span','b46pm-state pending'")||
    !result.includes("function makeBttsCandidatesSection(){")||
    result.includes("function bttsCardCleanV2("))
      throw Error('BTTS_EXACT_1X2_CARD_REUSE_NOT_INSTALLED');
  return {code:result,reusesSameCardFunction:true,reusesSameCSS:true,
    onlyBttsScreeningUIChanged:true,noOddsFabricated:true,noBackendChanges:true};
}

// UI-only: fix incorrect 5-column inherited Live Score grid on BTTS candidate
// cards, which produced 25px stats cells on PC and 38px on narrow phones.
// The CSS is scoped to #b46pm-btts-candidates. No 1X2/predictions/CSS global changes.
export const B46_BTTS_LAYOUT_CLEAN_V2='B46_BTTS_CANDIDATE_RESPONSIVE_LAYOUT_V2';
function once(s,a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('B46_BTTS_LAYOUT_ANCHOR_'+label+'_'+n);
 return s.replace(a,b);
}
function bttsCardCleanV2(r){
    const card=el('article','b46pm-match b46pm-premium-match b46pm-btts-screen-card');
    card.dataset.b46BttsCandidateFixture=String(r.fixtureId);
    card.setAttribute('aria-label','BTTS screening candidate, not a published prediction');
    const body=el('div','b46pm-btts-card-content');
    const meta=el('div','b46pm-btts-card-meta');
    const league=el('span','b46pm-btts-card-league',r.leagueName||'League unavailable');
    const date=el('time','b46pm-btts-card-date',bttsCandidateDate(r.kickoff));
    if(Number.isFinite(Number(r.kickoff))&&Number(r.kickoff)>0)
      date.dateTime=new Date(Number(r.kickoff)*1000).toISOString();
    meta.append(league,date);body.append(meta);
    const teams=el('div','b46pm-btts-matchup');
    teams.append(el('strong','b46pm-btts-home',r.home||'Home'),
      el('span','b46pm-btts-vs','VS'),
      el('strong','b46pm-btts-away',r.away||'Away'));
    body.append(teams);
    const pick=bttsCandidateProb(r);
    const metrics=el('div','b46pm-btts-metrics');
    for(const [label,value] of [
      ['BTTS SIDE',pick?.side??'—'],
      ['PROBABILITY',pick?((pick.p*100).toFixed(1)+'%'):'—'],
      ['LAST MATCHES',String(r.homeHistory)+'/10 · '+String(r.awayHistory)+'/10']
    ]){
      const metric=el('div','b46pm-btts-metric');
      metric.append(el('small','',label),el('strong','',value));
      metrics.append(metric);
    }
    body.append(metrics);
    const footer=el('div','b46pm-btts-footer');
    const status=r.status==='NOT_OFFERED'
      ?'BET365 · NOT OFFERED':'BET365 · PRICE NEEDED';
    footer.append(el('span','b46pm-btts-price-state',status),
      el('span','b46pm-btts-disclaimer','SCREENING ONLY · #'+String(r.fixtureId)));
    body.append(footer);
    card.append(body);
    return card;
  }
function bttsLayoutCssV2(){
 return [
  '/* BALL46 BTTS V2: Scoped responsive screening cards, no global CSS */',
  '#b46pm-btts-candidates{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:16px!important;row-gap:16px!important;align-items:start!important;min-width:0!important}',
  '#b46pm-btts-candidates>.b46pm-list-head,#b46pm-btts-candidates>.b46pm-empty{grid-column:1/-1!important;min-width:0!important;margin:0!important}',
  '#b46pm-btts-candidates>.b46pm-list-head{display:flex!important;flex-wrap:wrap!important;align-items:baseline!important;justify-content:space-between!important;gap:8px 16px!important;padding:0 2px 4px!important}',
  '#b46pm-btts-candidates>.b46pm-btts-screen-card{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;overflow:visible!important;border-radius:12px!important;box-sizing:border-box!important;align-self:stretch!important}',
  '#b46pm-btts-candidates .b46pm-btts-card-content{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;min-width:0!important;padding:16px!important;box-sizing:border-box!important}',
  '#b46pm-btts-candidates .b46pm-btts-card-meta{display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:space-between!important;gap:6px 12px!important;min-width:0!important;padding-bottom:12px!important}',
  '#b46pm-btts-candidates .b46pm-btts-card-league{font-size:12px!important;font-weight:750!important;line-height:1.5!important;white-space:normal!important;overflow:visible!important;overflow-wrap:anywhere!important;min-width:0!important;flex:1 1 180px!important}',
  '#b46pm-btts-candidates .b46pm-btts-card-date{font-size:11px!important;line-height:1.5!important;white-space:nowrap!important;opacity:.78!important;flex:0 0 auto!important}',
  '#b46pm-btts-candidates .b46pm-btts-matchup{display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important;align-items:center!important;gap:10px!important;min-width:0!important;min-height:66px!important;padding:12px 0 14px!important;border-top:1px solid rgba(130,155,145,.18)!important}',
  '#b46pm-btts-candidates .b46pm-btts-matchup strong{display:block!important;font-size:14px!important;line-height:1.4!important;font-weight:720!important;min-width:0!important;overflow-wrap:anywhere!important;white-space:normal!important}',
  '#b46pm-btts-candidates .b46pm-btts-home{text-align:left!important}',
  '#b46pm-btts-candidates .b46pm-btts-away{text-align:right!important}',
  '#b46pm-btts-candidates .b46pm-btts-vs{font-size:10px!important;line-height:1.4!important;letter-spacing:.06em!important;opacity:.55!important;white-space:nowrap!important}',
  '#b46pm-btts-candidates .b46pm-btts-metrics{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;min-width:0!important}',
  '#b46pm-btts-candidates .b46pm-btts-metric{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:7px!important;min-width:0!important;min-height:66px!important;padding:10px 12px!important;border-radius:9px!important;background:rgba(125,145,140,.075)!important;border:1px solid rgba(125,145,140,.15)!important;box-sizing:border-box!important;text-align:left!important}',
  '#b46pm-btts-candidates .b46pm-btts-metric small{display:block!important;font-size:10px!important;font-weight:650!important;line-height:1.35!important;letter-spacing:.025em!important;white-space:normal!important;overflow-wrap:anywhere!important;opacity:.72!important}',
  '#b46pm-btts-candidates .b46pm-btts-metric strong{display:block!important;font-size:16px!important;font-weight:780!important;line-height:1.25!important;overflow-wrap:anywhere!important;white-space:normal!important;font-variant-numeric:tabular-nums!important}',
  '#b46pm-btts-candidates .b46pm-btts-footer{display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:space-between!important;gap:7px 14px!important;min-width:0!important;padding-top:12px!important;margin-top:14px!important;border-top:1px solid rgba(130,155,145,.18)!important}',
  '#b46pm-btts-candidates .b46pm-btts-price-state{font-size:11px!important;font-weight:750!important;line-height:1.5!important;white-space:normal!important;overflow-wrap:anywhere!important}',
  '#b46pm-btts-candidates .b46pm-btts-disclaimer{font-size:10px!important;line-height:1.5!important;letter-spacing:.025em!important;opacity:.62!important;white-space:normal!important;overflow-wrap:anywhere!important}',
  '@media(max-width:1279px){#b46pm-btts-candidates{grid-template-columns:minmax(0,1fr)!important}}',
  '@media(max-width:560px){#b46pm-btts-candidates{row-gap:12px!important}#b46pm-btts-candidates .b46pm-btts-card-content{padding:14px!important}#b46pm-btts-candidates .b46pm-btts-matchup{gap:8px!important;min-height:72px!important}#b46pm-btts-candidates .b46pm-btts-matchup strong{font-size:13px!important}#b46pm-btts-candidates .b46pm-btts-metrics{gap:7px!important}#b46pm-btts-candidates .b46pm-btts-metric{min-height:66px!important;padding:9px 8px!important;gap:6px!important}#b46pm-btts-candidates .b46pm-btts-metric strong{font-size:15px!important}#b46pm-btts-candidates .b46pm-btts-metric small{font-size:9px!important}}',
  '@media(max-width:350px){#b46pm-btts-candidates .b46pm-btts-metric{padding:9px 6px!important}#b46pm-btts-candidates .b46pm-btts-matchup{gap:6px!important}}'
 ].join('\n')
}
export function patchBttsLayoutCleanClient(client){
 if(typeof client!=='string'||!client.includes('function makeBttsCandidateCard(r){')||
   !client.includes('function makeBttsCandidatesSection(){')||
   !client.includes('function refreshBttsCandidatesSection(){')||
   !client.includes('b46pm-btts-candidates'))
  throw Error('NOT_LATEST_PREPRICE_BTTS_UI_CLIENT');
 let result=client;
 const cardStart='  function makeBttsCandidateCard(r){';
 const cardEnd='  function makeBttsCandidatesSection(){';
 const startAt=result.indexOf(cardStart),endAt=result.indexOf(cardEnd,startAt);
 if(startAt<0||endAt<0||result.indexOf(cardStart,startAt+1)!==-1)throw Error('CARD_FUNCTION_DRIFT');
 result=result.slice(0,startAt)+bttsCardCleanV2.toString().replace('function bttsCardCleanV2','function makeBttsCandidateCard')+'\n  '+result.slice(endAt);
 const marker="    const section=el('section','b46pm-list b46pm-premium-list');";
 const add="    const section=el('section','b46pm-list b46pm-premium-list');\n"+
   "    const style=el('style','');\n"+
   "    style.id='b46pm-btts-layout-clean-v2';\n"+
   "    style.textContent=bttsLayoutCssV2();\n"+
   "    section.append(style);";
 result=once(result,marker,add,'INSERT_SCOPED_STYLESHEET');
 const sectionMarker='  function makeBttsCandidatesSection(){';
 result=once(result,sectionMarker,bttsLayoutCssV2.toString()+'\n  '+sectionMarker,'LAYOUT_STYLE_HELPER');
 if(!result.includes('b46pm-btts-card-content')||!result.includes('b46pm-btts-layout-clean-v2'))
  throw Error('BTTS_CLEAN_LAYOUT_NOT_INSTALLED');
 return {code:result,scope:'BTTS_PREPRICE_TEST_ONLY',cssOnlyBTTS:true,
  original1X2AndIssuedCardsUntouched:true,localSideEffects:0};
}

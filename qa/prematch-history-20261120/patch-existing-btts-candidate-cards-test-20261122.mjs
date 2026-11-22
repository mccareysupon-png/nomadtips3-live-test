// Add real probability-pass pre-price candidates to the existing BALL46
// PreMatch TEST BTTS view. Do NOT publish picks or change a model/ledger.
export const B46_BTTS_CANDIDATES_ROUTE='/__b46_pm_btts_candidates';
function replaceOnce(s,a,b,name){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('BTTS_CANDIDATE_ANCHOR_'+name+'_'+n);
 return s.replace(a,b);
}
// Browser helpers are embedded into the existing in-page BTTS client IIFE.
// The exact source body is extracted so no handwritten source escaping is needed.
function bttsCandidateBrowserHelpers(){
  const bttsCandidateProb=r=>{
    const y=Number(r?.probabilityYes),n=Number(r?.probabilityNo);
    const yes=Number.isFinite(y)&&y>=0&&y<=1?y:null;
    const no=Number.isFinite(n)&&n>=0&&n<=1?n:null;
    if(yes===null&&no===null)return null;
    return yes!==null&&(no===null||yes>=no)?{side:'YES',p:yes}:{side:'NO',p:no};
  };
  const bttsCandidateDate=s=>{
    const ms=Number(s)*1000;
    return Number.isFinite(ms)&&ms>0
      ?new Date(ms).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      :'Time unavailable';
  };
  function makeBttsCandidateCard(r){
    const card=el('article','b46pm-match b46pm-premium-match');
    card.dataset.b46BttsCandidateFixture=String(r.fixtureId);
    card.setAttribute('aria-label','BTTS screening candidate, not a published prediction');
    const compact=el('div','b46pm-premium-summary');
    const meta=el('div','b46pm-meta b46pm-premium-meta');
    meta.append(el('span','b46pm-premium-league',r.leagueName||'League unavailable'));
    meta.append(el('span','b46pm-state',bttsCandidateDate(r.kickoff)));
    compact.append(meta);
    const teams=el('div','b46pm-teams b46pm-premium-teams');
    teams.append(el('span','',r.home||'Home'),el('span','b46pm-vs',' vs '),el('span','',r.away||'Away'));
    compact.append(teams);
    const prob=bttsCandidateProb(r);
    const quick=el('div','b46pm-premium-quick');
    for(const [label,value] of [
      ['BTTS SIDE',prob?.side??'—'],
      ['PROBABILITY',prob?((prob.p*100).toFixed(1)+'%'):'—'],
      ['HISTORY',String(r.homeHistory)+'/10 · '+String(r.awayHistory)+'/10'],
      ['PRICE',r.status==='NOT_OFFERED'?'NOT OFFERED':'WAIT BET365']
    ]){
      const metric=el('div','b46pm-premium-quick-metric');
      metric.append(el('small','',label),el('strong','',value));quick.append(metric);
    }
    compact.append(quick);
    const status=el('div','b46pm-premium-status');
    status.append(el('span','b46pm-state pending',
      r.status==='NOT_OFFERED'?'BET365 · NOT OFFERED':'BET365 · PRICE NEEDED'));
    status.append(el('small','','Fixture #'+String(r.fixtureId)+' · SCREENING ONLY'));
    compact.append(status);card.append(compact);
    return card;
  }
  function makeBttsCandidatesSection(){
    const section=el('section','b46pm-list b46pm-premium-list');
    section.id='b46pm-btts-candidates';
    section.setAttribute('aria-label','BTTS probability candidates — TEST ONLY');
    const head=el('div','b46pm-list-head');
    head.append(el('h2','','BTTS · Probability screening (TEST)'),
      el('span','',String(bttsCandidates.length)+' candidates · Not published'));
    section.append(head);
    if(bttsCandidates.length){
      const sorted=[...bttsCandidates].sort((a,b)=>
        Number(a.kickoff)-Number(b.kickoff)||String(a.fixtureId).localeCompare(String(b.fixtureId)));
      for(const item of sorted)section.append(makeBttsCandidateCard(item));
    }else{
      section.append(el('p','b46pm-empty',
        bttsScreening?'No pre-price candidates in the current test window.':'Loading actual BTTS candidates…'));
    }
    if(bttsCandidatesPageInfo?.truncated)
      section.append(el('p','b46pm-empty',
        'More candidates exist in the archive. This TEST view displays the first 25 per status.'));
    return section;
  }
  function refreshBttsCandidatesSection(){
    if(mode!=='btts')return;
    const current=$('#b46pm-btts-candidates');
    if(current)current.replaceWith(makeBttsCandidatesSection());
  }
  async function getBttsCandidatesPreview(filter){
    const r=await fetch('/__b46_pm_btts_candidates?filter='+encodeURIComponent(filter)+'&page=1',
      {cache:'no-store'});
    if(!r.ok)throw Error('BTTS_CANDIDATE_HTTP_'+r.status);
    const d=await r.json();
    if(d?.mode!=='READ_ONLY_BTTS_SHADOW'||d?.preview?.filter!==filter||
      !Array.isArray(d?.preview?.rows)||!Number.isSafeInteger(d.preview.pages)||
      d.providerCalls!==0||d.published!==0)throw Error('INVALID_BTTS_CANDIDATE_PAYLOAD');
    return d.preview;
  }
}
export function patchBttsCandidateClient(client){
 if(typeof client!=='string'||!client.includes('bttsScreeningSequence=0')||
  !client.includes("const readiness=el('p','b46pm-empty',bttsScreeningLabel())")||
  !client.includes("if(mode==='btts')loadBttsScreening();"))
  throw Error('NOT_THE_ACTIVE_BALL46_BTTS_READINESS_CLIENT');
 let s=client;
 s=replaceOnce(s,
  'bttsScreening=null, bttsScreeningSequence=0, monitor=null',
  'bttsScreening=null, bttsScreeningSequence=0, bttsCandidates=[], bttsCandidatesPageInfo=null, monitor=null',
  'CANDIDATE_STATE');
 const body=bttsCandidateBrowserHelpers.toString();
 const helpers=body.slice(body.indexOf('{')+1,body.lastIndexOf('}'));
 s=replaceOnce(s,'  async function loadBttsScreening(){',
  helpers+'\n  async function loadBttsScreening(){','CANDIDATE_HELPERS');
 s=replaceOnce(s,'      bttsScreening=d.totals;',
  "      bttsScreening=d.totals;\n"+
  "      // Read the actual unpriced/price-not-offered fixtures, not the BTTS pick ledger.\n"+
  "      const previews=await Promise.all([getBttsCandidatesPreview('WAITING_PRICE'),\n"+
  "        getBttsCandidatesPreview('NOT_OFFERED')]);\n"+
  "      if(request!==bttsScreeningSequence)return;\n"+
  "      const unique=new Map();\n"+
  "      for(const page of previews)for(const item of page.rows){\n"+
  "        const prob=bttsCandidateProb(item);\n"+
  "        if(!prob||prob.p<0.60||!item.fixtureId)continue;\n"+
  "        unique.set(String(item.fixtureId),item);\n"+
  "      }\n"+
  "      bttsCandidates=[...unique.values()];\n"+
  "      bttsCandidatesPageInfo={truncated:previews.some(page=>page.pages>1)};",
  'LOAD_PREPRICE_FIXTURE_CARDS');
 s=replaceOnce(s,
  "      bttsScreening=null;\n      console.warn('BTTS test readiness unavailable',String(e));",
  "      bttsScreening=null;bttsCandidates=[];bttsCandidatesPageInfo=null;\n"+
  "      console.warn('BTTS test readiness unavailable',String(e));",
  'NO_INVENTED_CANDIDATES_ON_ERROR');
 s=replaceOnce(s,
  "      if(line)line.textContent=bttsScreeningLabel();",
  "      if(line)line.textContent=bttsScreeningLabel();\n"+
  "      refreshBttsCandidatesSection();",
  'REFRESH_CARDS_WITHOUT_SCROLL_JUMP');
 s=replaceOnce(s,
  "    const mirrorOn=mode==='predictions'&&!!window.B46PreMatchLiveMirror",
  "    if(mode==='btts'&&!existingContent)content.append(makeBttsCandidatesSection());\n"+
  "    const mirrorOn=mode==='predictions'&&!!window.B46PreMatchLiveMirror",
  'PLACE_PREPRICE_SECTION_ABOVE_RECORDED_PICKS');
 if(!s.includes('b46pm-btts-candidates')||!s.includes('SCREENING ONLY'))
  throw Error('BTTS_CANDIDATE_CARD_PATCH_MISSING');
 return {code:s,onlyExistingBTTS:true,noCSSChanges:true,noLedgerChanges:true};
}
export function patchBttsCandidateRoute(worker){
 const anchor='if (u.pathname === "/__b46_pm_btts_readiness") return env.PREMATCH_STORE.fetch("https://prematch.internal/btts-preview-data?page=1&filter=ALL");';
 const extra="if (u.pathname === \"/__b46_pm_btts_candidates\") {\n"+
  "    const filter=u.searchParams.get(\"filter\");\n"+
  "    if(filter!==\"WAITING_PRICE\"&&filter!==\"NOT_OFFERED\")\n"+
  "      return new Response(\"Invalid BTTS filter\",{status:400});\n"+
  "    const page=Number(u.searchParams.get(\"page\")??\"1\");\n"+
  "    if(!Number.isSafeInteger(page)||page<1||page>20)\n"+
  "      return new Response(\"Invalid page\",{status:400});\n"+
  "    return env.PREMATCH_STORE.fetch(\"https://prematch.internal/btts-preview-data?filter=\"+filter+\"&page=\"+page);\n"+
  "  }";
 if(worker.split(anchor).length!==2||worker.includes('u.pathname === "/__b46_pm_btts_candidates"'))
  throw Error('BTTS_CANDIDATE_PROXY_ANCHOR_CHANGED');
 return {code:worker.replace(anchor,anchor+'\n  '+extra),extra};
}

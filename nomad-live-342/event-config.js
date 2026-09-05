(()=>{
'use strict';
const defaults=Object.freeze({
  minuteFrom:55,
  minuteTo:80,
  rollingWindowMinutes:8,
  scoreDifferenceFilterEnabled:true,
  maxScoreDifference:1,
  attackWeight:1,
  dangerousAttackWeight:2.5,
  homePressureShareMinimum:62,
  trendConditionsRequired:3,
  homeEventRequired:true,
  sotEvidenceEnabled:true,
  sotDeltaMinimum:1,
  shotOffEvidenceEnabled:true,
  shotOffDeltaMinimum:1,
  cornerEvidenceEnabled:true,
  cornerDeltaMinimum:1,
  evidenceMode:'ALL',
  allowedLinesMode:'ANY',
  allowedSelectionLines:Object.freeze([]),
  oddsMinimum:1.45,
  oddsMaximumEnabled:true,
  oddsMaximum:2.10,
  maximumPriceAgeSeconds:30,
  oneSignalPerMatch:true
});
window.NOMAD342_CONFIG=Object.freeze({
  version:'20260905-k-ultra-selective-v1',
  settingsKey:'nomadSettings342KUltraV1',
  defaults
});
window.NOMAD342_K_LIVE_PRESET=Object.freeze({
  version:'k-ultra-selective-v1',
  name:'K ULTRA SELECTIVE',
  locked:true,
  scope:'ALL_LIVE_MATCHES',
  event:Object.freeze({
    minuteFrom:defaults.minuteFrom,
    minuteTo:defaults.minuteTo,
    rollingWindowMinutes:defaults.rollingWindowMinutes,
    homePressureShareMinimum:defaults.homePressureShareMinimum,
    trendConditionsRequired:defaults.trendConditionsRequired,
    evidenceMode:defaults.evidenceMode,
    sotDeltaMinimum:defaults.sotDeltaMinimum,
    shotOffDeltaMinimum:defaults.shotOffDeltaMinimum,
    cornerDeltaMinimum:defaults.cornerDeltaMinimum
  }),
  market:Object.freeze({
    ah:'AUTO_MAIN_LINE',
    oneXtwo:'AUTO',
    totals:'AUTO_MAIN_LINE',
    maxAgeMs:30000,
    minReferees:3,
    moderateShare:0.62,
    strongShare:0.66,
    directionalMarkets:Object.freeze(['AH','1X2']),
    totalsRole:'CONTEXT'
  }),
  grading:Object.freeze({
    eventPassRequired:true,
    strongRequiresBothDirectional:true,
    strongRequiresAtLeastOneStrong:true,
    awayAhIsConflict:true,
    away1X2StrongIsConflict:true,
    draw1X2IsNeutral:true
  }),
  behavior:Object.freeze({
    failOpen:false,
    blocksLiveScore:false,
    blocksEventGate:false,
    changesPrediction:false,
    marketOfflineStatus:'EVENT ONLY'
  })
});
})();

/* UI-only public navigation/footer layer for NOMAD Live 3.42.
   It does not read or mutate the event feed, market runtime, prediction state,
   graph state, card state, or NOMAD342_CONFIG values above. */
(()=>{
'use strict';

const stripPicksNavigation=()=>{
  document.querySelectorAll('.topnav a,.mobile-nav a').forEach(link=>{
    const href=String(link.getAttribute('href')||'');
    if(/soccer-predictions/i.test(href))link.remove();
  });
};

const ensureStyle=()=>{
  if(document.getElementById('nomad342-info-linkrail-style'))return;
  const style=document.createElement('style');
  style.id='nomad342-info-linkrail-style';
  style.textContent=`
    .nomad-342-info-linkrail{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0;margin:28px auto 18px;max-width:1120px;padding:14px 12px 0;border-top:1px solid rgba(255,255,255,.07)}
    .nomad-342-info-linkrail a{position:relative;padding:3px 12px;color:#929792;text-decoration:none;font:800 9px/1.35 Arial,Helvetica,sans-serif;letter-spacing:.015em;transition:color .14s ease}
    .nomad-342-info-linkrail a+a::before{content:"";position:absolute;left:0;top:50%;width:1px;height:10px;transform:translateY(-50%);background:rgba(255,255,255,.16)}
    .nomad-342-info-linkrail a:hover,.nomad-342-info-linkrail a:focus-visible{color:#00f0a8;outline:none}
    .nomad-342-info-linkrail a:focus-visible{text-decoration:underline;text-underline-offset:3px}
    @media(max-width:700px){.nomad-342-info-linkrail{row-gap:6px;margin-bottom:64px;padding-top:12px}.nomad-342-info-linkrail a{padding:4px 9px;font-size:8.5px}.nomad-342-info-linkrail a+a::before{height:9px}}
  `;
  document.head.appendChild(style);
};

const mountFooterRail=()=>{
  stripPicksNavigation();
  ensureStyle();
  if(document.querySelector('.nomad-342-info-linkrail'))return;
  const nav=document.createElement('nav');
  nav.className='nomad-342-info-linkrail';
  nav.setAttribute('aria-label','NOMADTIPS3 information pages');
  const links=[
    ['Soccer Precictions','../soccer-predictions/'],
    ['About Us','../about/'],
    ['User Guide','../user-guide/'],
    ['Privacy Policy','../privacy/'],
    ['Terms of Service','../terms/'],
    ['Disclaimer','../disclaimer/']
  ];
  nav.innerHTML=links.map(([label,href])=>`<a href="${href}">${label}</a>`).join('');
  document.body.appendChild(nav);
};

stripPicksNavigation();
ensureStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountFooterRail,{once:true});
else mountFooterRail();
})();

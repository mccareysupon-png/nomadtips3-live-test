function exact(s,a,b,id){
 const n=s.split(a).length-1;if(n<1)throw Error('RENDER_SOURCE_DRIFT '+id);return s.replaceAll(a,b);
}
const badgeFrom="label=n===1?'Signal':'Signals'",badgeTo="label=n===1?'Prediction':'Predictions'";
export function patchHtml(s){
 s=exact(s,'<i class="workspace-nav-mark signal"></i>Signal</span>','<i class="workspace-nav-mark signal"></i>Live Predictions</span>','desktop-sidebar-label');
 s=exact(s,'data-b46m-page="signal">'+String.fromCharCode(36)+"{svg('trend')}"+'<span>Signals</span>','data-b46m-page="signal">'+String.fromCharCode(36)+"{svg('trend')}"+'<span>Live Predictions</span>','mobile-drawer-label');
 s=exact(s,badgeFrom,badgeTo,'desktop-badge');
 s=exact(s,"f.signalCount+' signal'","f.signalCount+(f.signalCount===1?' Prediction':' Predictions')",'mobile-badge');
 s=exact(s,'content:"ACTIVE SIGNALS"','content:"ACTIVE PREDICTIONS"','featured-css');
 s=exact(s,"s.dataset.market='signal';s.textContent='SIGNAL'","s.dataset.market='signal';s.textContent='LIVE PREDICTION'",'league-heading');
 const css='<style id="b46-featured-prediction-label-test">html body :is(#b46gn-detail#b46gn-detail#b46gn-detail,.live-stage-grid > .right-rail) .featured-card[data-featured] .feature-signal::before{content:"ACTIVE PREDICTIONS"!important}</style>';
 s=exact(s,'</body>',css+'</body>','featured-css-final');

 // Membership promotion CTA only: retain original card, dimensions, image, text and link.
 if(!s.includes('class="b46mp-cta"'))throw Error('RENDER_SOURCE_DRIFT member-cta');
 const promoCss=`<style id="b46-member-promo-cta-test-20261120">
 html:root[data-theme] body .b46mp-card[data-b46mp-theme="dark"] .b46mp-cta,
 html:root body .b46mp-card[data-b46mp-theme="dark"] .b46mp-cta {
   color:#302400!important;
   background:linear-gradient(180deg,#ffe580 0%,#ffda56 54%,#f3c442 100%)!important;
   border:1px solid #f7d16a!important;
   box-shadow:inset 0 1px 0 rgba(255,255,255,.36),0 2px 5px rgba(239,184,42,.13)!important;
   text-shadow:none!important;
 }
 html:root[data-theme] body .b46mp-card[data-b46mp-theme="light"] .b46mp-cta,
 html:root body .b46mp-card[data-b46mp-theme="light"] .b46mp-cta {
   color:#fff!important;
   background:linear-gradient(180deg,#c65709 0%,#bb4b05 54%,#b04405 100%)!important;
   border:1px solid #a7460d!important;
   box-shadow:inset 0 1px 0 rgba(255,232,197,.25),0 2px 5px rgba(184,75,13,.13)!important;
   text-shadow:none!important;
 }
 html:root body .b46mp-card[data-b46mp-theme] .b46mp-cta {
   transition:filter 160ms ease,box-shadow 160ms ease,border-color 160ms ease!important;
   transform:none!important;
   filter:none!important;
 }
 html:root[data-theme] body .b46mp-card[data-b46mp-theme="dark"]:is(:hover,:focus-visible) .b46mp-cta,
 html:root body .b46mp-card[data-b46mp-theme="dark"]:is(:hover,:focus-visible) .b46mp-cta {
   filter:brightness(1.07)!important;
   border-color:#ffe49a!important;
   box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 3px 8px rgba(239,184,42,.22)!important;
 }
 html:root[data-theme] body .b46mp-card[data-b46mp-theme="light"]:is(:hover,:focus-visible) .b46mp-cta,
 html:root body .b46mp-card[data-b46mp-theme="light"]:is(:hover,:focus-visible) .b46mp-cta {
   filter:brightness(1.08)!important;
   border-color:#c05a17!important;
   box-shadow:inset 0 1px 0 rgba(255,232,197,.35),0 3px 8px rgba(184,75,13,.19)!important;
 }
 @media(prefers-reduced-motion:reduce){html:root body .b46mp-card[data-b46mp-theme] .b46mp-cta{transition:none!important}}
 html:root body .b46mp-card[data-b46mp-theme] .b46mp-cta svg{color:inherit!important;stroke:currentColor!important;filter:none!important}
 </style>`;
 s=exact(s,'</body>',promoCss+'</body>','member-cta-css');
 return s;
}
export function patchDashboard(s){
 s=exact(s,badgeFrom,badgeTo,'pin-badge');
 s=exact(s,'<span>Signal '+String.fromCharCode(36)+'{esc(entryMin','<span>Prediction '+String.fromCharCode(36)+'{esc(entryMin','featured-minute');
 s=exact(s,"setText('[data-featured-kicker]',signalView?'FEATURED SIGNAL':'FEATURED MATCH');",'','remove-mode-heading');
 s=exact(s,"signalTitle=sigs.map(signalSummary).join(' • ');if(signal)","signalTitle=sigs.map(signalSummary).join(' • ');setText('[data-featured-kicker]',hasSignals?'FEATURED LIVE PREDICTION':'FEATURED MATCH');if(signal)",'selected-match-heading');
 s=exact(s,'function clearFeatured(){',"function clearFeatured(){setText('[data-featured-kicker]','FEATURED MATCH');",'empty-heading');
 return s;
}

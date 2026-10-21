import assert from 'node:assert/strict';
export const ODDS_VERSION='20261021-topbar-v1';
export function patchOdds({html,js}){
 const exact=(s,a,b,label)=>{assert.equal(s.split(a).length-1,1,'ANCHOR_DRIFT_'+label);return s.replace(a,b);};
 assert(html.includes('b46-member-loading')&&html.includes('kpiV7=desktop-nine-in-one-row-20261020'),'LATEST_MEMBER_HTML_MISSING');
 assert(js.includes("ball46:member-data-ready")&&js.includes("b46-member-eventflow-signal-v3-20261020"),'MEMBER_APP_LATEST_FEATURE_MISSING');
 assert(js.includes("['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']"),'HALF_WIN_FOLD_MISSING');
 assert(js.includes("['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']"),'HALF_LOSS_FOLD_MISSING');
 assert(!js.includes('Ball46MemberOdds')&&!html.includes('b46-member-odds-wrap'),'ODDS_ALREADY_INSTALLED');
 html=exact(html,'<div class="topbar-account-slot">',"<div class=\"b46-odds-wrap\" id=\"b46-member-odds-wrap\">\n      <button id=\"b46-member-odds-trigger\" class=\"b46-odds-trigger\" type=\"button\" aria-haspopup=\"menu\" aria-controls=\"b46-member-odds-menu\" aria-expanded=\"false\" aria-label=\"Odds format settings\" title=\"Odds display: Decimal\">\n        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"2\"/><circle cx=\"16\" cy=\"17\" r=\"2\"/></svg>\n      </button>\n      <div id=\"b46-member-odds-menu\" class=\"b46-odds-menu\" role=\"menu\" aria-label=\"Odds display format\" hidden>\n        <div class=\"b46-odds-heading\">ODDS DISPLAY FORMAT <span class=\"b46-odds-code\" id=\"b46-member-odds-code\">DEC</span></div>\n        <button type=\"button\" class=\"b46-odds-option\" role=\"menuitemradio\" data-b46-odds-format=\"DEC\" aria-checked=\"true\"><span class=\"b46-odds-dot\" aria-hidden=\"true\"></span>Decimal<span class=\"b46-odds-short\">DEC</span></button>\n        <button type=\"button\" class=\"b46-odds-option\" role=\"menuitemradio\" data-b46-odds-format=\"FRA\" aria-checked=\"false\"><span class=\"b46-odds-dot\" aria-hidden=\"true\"></span>Fractional<span class=\"b46-odds-short\">FRA</span></button>\n        <button type=\"button\" class=\"b46-odds-option\" role=\"menuitemradio\" data-b46-odds-format=\"AM\" aria-checked=\"false\"><span class=\"b46-odds-dot\" aria-hidden=\"true\"></span>American<span class=\"b46-odds-short\">AM</span></button>\n        <div class=\"b46-odds-note\">Display only. Recorded entry odds and settlement remain unchanged.</div>\n      </div>\n    </div>\n    "+'<div class="topbar-account-slot">','TOPBAR_ACCOUNT_SLOT');
 html=exact(html,'</head>','  <link rel="stylesheet" href="/member-odds-topbar.css?v=20261021-topbar-v1">\n</head>','TOPBAR_CSS');
 html=html.replace(/(<script src="\/member\.js\?[^"]+)"/,(_match,part)=>part+'&b46OddsTopbarV1=20261021"');
 assert.equal((html.match(/b46OddsTopbarV1=20261021/g)||[]).length,1,'MEMBER_JS_CACHE_BUST_FAILED');
 html=exact(html,'<script src="/member.js?', '<script src="/member-odds-topbar.js?v=20261021-topbar-v1" defer></script>\n<script src="/member.js?','TOPBAR_SCRIPT');
 const originalFmt="function fmtOdds(v){\n  const n=Number(v);\n  return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}";
 const compactFmt="function fmtOdds(v){ const n=Number(v); return Number.isFinite(n)?'@'+n.toFixed(2):'—'; }";
 const match=js.includes(originalFmt)?originalFmt:compactFmt;
 js=exact(js,match,"function fmtOdds(v){\n  const fmt=window.Ball46MemberOdds;\n  if(fmt&&typeof fmt.formatOdds==='function')return fmt.formatOdds(v);\n  const n=Number(v);return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}",'FMT_ODDS');
 const renderLine="function render(){renderFavoritesNav();renderTabs();renderSummary();renderCornerAudit();renderRows();renderPagination();}";
 const eventLine="window.addEventListener('ball46:member-odds-format-change',()=>{if(state.payload)render();});";
 js=exact(js,renderLine,renderLine+'\n'+eventLine,'ODDS_REFRESH');
 assert(html.includes('<div class="b46-odds-wrap"')&&html.includes('member-odds-topbar.css'));
 assert(js.includes('Ball46MemberOdds')&&js.includes(eventLine));
 return {html,js};
}

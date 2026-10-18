import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const marker='/* BALL46 MEMBER — V3 mobile default-first: exactly four visible rows, expand inline */';
const v3=css.slice(css.indexOf(marker));

test('all markets and favorites use existing Member filters',()=>{
  assert.match(html,/id="marketMenuToggle"/);
  assert.match(html,/id="marketTabs"/);
  assert.match(html,/id="mobileV5MarketToggle"/);
  assert.doesNotMatch(html,/id="mobileMarketPills"/);
  assert.match(js,/for\(const market of MARKET_ORDER\)/);
  assert.match(js,/sidebar\.addEventListener\('click'/);
  assert.match(js,/trigger\.addEventListener\('click'/);
  assert.match(js,/state\.favoritesView/);
});
test('default matches appear before expanded details (none open initially)',()=>{
  assert.doesNotMatch(html,/id="mobileMatchSpotlight"/);
  assert.doesNotMatch(js,/function renderMobileSpotlight\(\)/);
  assert.match(js,/function renderRows\(\)/);
  assert.match(js,/if\(!detailInserted && state\.expandedSignalId===row\.id\)/);
  assert.match(js,/rowsEl\.append\(signalTr\)/);
  assert.match(js,/rowsEl\.append\(detailTr\)/);
  assert.match(js,/function toggleDetail\(row\)/);
  assert.match(js,/state\.expandedSignalId=null/);
  assert.match(js,/function attachMobileExpandedControls\(host,matchFacts\)/);
});
test('default mobile card has exactly four visible rows without deleting signal data',()=>{
  assert.ok(v3.length>0);
  assert.match(v3,/grid-template-rows:16px 51px 24px/);
  assert.match(v3,/"detected detected detected detected"/);
  assert.match(v3,/"match match score score"/);
  assert.match(v3,/"market selection odds result"/);
  assert.match(v3,/grid-template-rows:repeat\(2,23px\)/);
  assert.match(js,/mobile-default-clock/);
  assert.match(js,/mobile-default-league/);
  assert.match(js,/mobile-default-state/);
  assert.match(v3,/signal-detail-row\{\s*display:block!important/);
});
test('expanded match reuses original match mirror and featured flow/history',()=>{
  assert.match(js,/function renderInsight\(host,fixtureId\)/);
  assert.match(js,/state\.detailCache\.get\(fixtureId\)/);
  assert.match(js,/\/api\/member\/match\?fixtureId=/);
  assert.match(js,/featuredHorizontal\(detail,selected\)/);
  assert.match(js,/eventFlowChart\(detail,fixtureId\)/);
  assert.match(js,/attachMobileExpandedControls\(host,featured\.matchFacts\)/);
  assert.match(v3,/mobile-show-all-history/);
  assert.match(v3,/mobile-show-all-stats/);
});
test('mobile-only V3 does not edit Engine data, existing desktop navigation remains',()=>{
  assert.match(css,/@media\(max-width:767px\)/);
  assert.doesNotMatch(html,/mobile-bottom-navigation/);
  assert.doesNotMatch(js,/\.mobile-bottom-navigation button/);
  assert.match(js,/initMobileSectionTabs\(\)/);
  assert.match(css,/\.mobile-market-navigation\{display:contents\}/);
  assert.match(js,/function renderSummary\(\)/);
  assert.match(js,/function filteredRows\(\)/);
  assert.doesNotMatch(js,/function renderMobileMarketPills\(\)/);
});
test('approved V3 surfaces override older dark-shade classes on mobile only',()=>{
  const theme=v3.slice(v3.indexOf('Approved V3 colors take precedence'));
  assert.ok(theme.length>0);
  assert.match(v3,/background:linear-gradient\(145deg,#152c3a,#101f2c\)/);
  assert.match(theme,/signal-row\.signal-shade-odd:not\(\.expanded\)/);
  assert.match(theme,/signal-row\.signal-shade-even:not\(\.expanded\)/);
  assert.match(theme,/background-image:linear-gradient\(145deg,#152c3a,#101f2c\)/);
  assert.match(theme,/border-top:1px solid rgba\(255,255,255,\.07\)/);
  assert.match(v3,/grid-template-rows:16px 51px 24px/);
  assert.match(v3,/row-gap:5px/);
  assert.match(css,/mobile-default-market\{display:none\}/);
  assert.match(js,/cell\.prepend\(node\('span','mobile-default-market','CORNERS'\)\)/);
});

test('mobile V3 has one DOM component for each of the four visual lines',()=>{
  assert.match(js,/const compact=node\('div','mobile-v3-card'\)/);
  assert.match(js,/const head=node\('div','mobile-v3-line mobile-v3-meta'\)/);
  assert.match(js,/head\.append\(\s*node\('span','mobile-v3-clock',clock\),\s*node\('span','mobile-v3-league'/);
  assert.match(js,/compact\.append\(teamLine\('HOME',row\.home,scoreParts\[0\]\),teamLine\('AWAY',row\.away,scoreParts\[1\]\)\)/);
  assert.match(js,/const marketLine=node\('div','mobile-v3-line mobile-v3-market'\)/);
  assert.match(js,/compact\.append\(marketLine\)/);
  assert.match(js,/time\.append\(compact\)/);
  assert.match(js,/const compactStar=makeFavoriteButton\(row\)/);
  assert.match(js,/const compactOutcome=clockBadge\.cloneNode\(true\)/);
  const exact=css.slice(css.indexOf('/* Member Mobile V3 exact hierarchy'));
  assert.ok(exact.length>0);
  assert.match(exact,/grid-template-rows:16px 23px 23px 24px/);
  assert.match(exact,/grid-template-columns:auto minmax\(0,1fr\) auto 23px 13px/);
  assert.match(exact,/td:not\(\.signal-time\)\{\s*display:none!important/);
  assert.match(exact,/\.mobile-v3-card\{\s*display:grid!important/);
  assert.match(exact,/td\.signal-time>:not\(\.mobile-v3-card\)/);
});

test('mobile logo strip uses the approved V3 Deep Teal colors, without changing desktop header',()=>{
  const marker='/* BALL46 MEMBER — approved V3 mobile logo-strip Deep Teal gradient */';
  const idx=css.indexOf(marker);
  assert.ok(idx>0,'approved mobile header override exists');
  const portion=css.slice(idx);
  assert.match(portion,/@media\(max-width:767px\)/);
  assert.match(portion,/\.page-member \.topbar\{/);
  assert.match(portion,/background:linear-gradient\(180deg,#102635 0%,#0a1a27 100%\)/);
  assert.match(html,/mobileheader=20261018-v3-deepteal-v1/);
  assert.match(html,/brand-original-lettering/);
});

test('approved mobile V4 uses exact logo and KPI colors with real account and summary data',()=>{
  const marker='/* BALL46 MEMBER — approved mobile V4 source-color lockup, profile and KPI first */';
  const v4=css.slice(css.indexOf(marker));
  assert.ok(v4.length>0);
  assert.match(v4,/\.brand-logo\{[\s\S]*?color:#43E6A2!important/);
  assert.match(v4,/\.brand-logo>span\{\s*color:#FFA451!important/);
  assert.match(v4,/\.brand-member\{[\s\S]*?color:#9eb3c3!important/);
  assert.match(v4,/background:linear-gradient\(145deg,rgba\(22,64,83,\.48\),rgba\(16,45,65,\.39\)\)/);
  assert.match(v4,/background:linear-gradient\(145deg,rgba\(84,74,35,\.47\),rgba\(59,48,27,\.38\)\)/);
  assert.match(v4,/background:linear-gradient\(145deg,rgba\(25,79,67,\.48\),rgba\(16,53,49,\.38\)\)/);
  assert.match(v4,/background:linear-gradient\(145deg,rgba\(23,73,65,\.48\),rgba\(13,53,51,\.38\)\)/);
  assert.match(v4,/#dailySummary\{[\s\S]*?order:2;display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(v4,/@media\(max-width:349px\)\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(js,/const s=currentStats\(\)/);
  assert.match(js,/summary\.append\(pnlBox\)/);
  assert.match(js,/uniqueFixtures\.size\+' MATCH'/);
});
test('approved mobile V4 account popover is controlled and uses authenticated session values',()=>{
  assert.match(html,/id="mobileV4ProfileToggle"/);
  assert.match(html,/id="mobileV4ProfilePopover"[^>]*hidden/);
  assert.match(html,/id="mobileV4Name"/);
  assert.match(html,/id="mobileV4Status"/);
  assert.match(html,/id="mobileV4Avatar"/);
  assert.match(js,/function initMobileV4Profile\(\)/);
  assert.match(js,/if\(e\.key==='Escape'/);
  assert.match(js,/mobileName\.textContent=session\.member\.displayName/);
  assert.match(js,/mobileStatus\.textContent=memberAccessLabel\(session\.member\)/);
  assert.match(js,/mobileActive\.textContent=session\.member\.status/);
  assert.match(js,/mobileProfileToggle\.disabled=false/);
  assert.doesNotMatch(html,/>JAY</);
  assert.doesNotMatch(html,/>OWNER · LIFETIME</);
  assert.match(html,/mobile-v4-contextline/);
  assert.match(html,/mobile-v4-sectionbar/);
  assert.match(html,/mobile-v4-intro/);
  assert.match(html,/v4approved=20261018-header-profile-kpi-v1/);
});

test('mobile brand logo is exactly twenty percent larger and boldly rounded without touching desktop',()=>{
  const marker='/* BALL46 MEMBER — approved mobile V4 source-color lockup, profile and KPI first */';
  const v4=css.slice(css.indexOf(marker));
  assert.ok(v4.length>0);
  assert.match(v4,/@media\(max-width:767px\)/);
  assert.match(v4,/font-family:"Arial Rounded MT Bold",Manrope,Inter,system-ui,sans-serif/);
  assert.match(v4,/font-size:27\.6px!important;font-weight:900/);
  assert.match(v4,/-webkit-text-stroke:\.4px currentColor/);
  assert.match(v4,/-webkit-text-stroke:\.4px #FFA451/);
  assert.match(html,/logofont=20261018-heavy120-v1/);
});

test('unified mobile lockup is green and orange on every Member site page',()=>{
  const cross=css.slice(css.indexOf('/* BALL46 MEMBER — single mobile wordmark across'));
  assert.ok(cross.length>0);
  assert.match(cross,/@media\(max-width:767px\)/);
  assert.match(cross,/\.topbar a\.brand \.brand-logo\{/);
  assert.match(cross,/font-size:27\.6px!important/);
  assert.match(cross,/color:#43E6A2!important/);
  assert.match(cross,/\.topbar a\.brand \.brand-logo>span\{/);
  assert.match(cross,/color:#FFA451!important/);
  assert.match(cross,/\.topbar a\.brand \.brand-member\{/);
  for(const page of ['member.html','pricing.html','login.html','success.html']){
    const source=readFileSync(new URL('../public/'+page,import.meta.url),'utf8');
    assert.match(source,/class="brand(?: brand-original-lettering)?"/);
    assert.match(source,/<span class="brand-logo">ball<span>46<\/span><\/span>/);
    assert.match(source,/allmobilelogo=20261018-green-orange-unboxed-v1/);
  }
});
test('mobile profile has only the clickable icon until member details are requested',()=>{
  const v4=css.slice(css.indexOf('/* BALL46 MEMBER — approved mobile V4'));
  assert.match(v4,/\.topbar-account-slot>\.member-chip\{display:none!important\}/);
  assert.match(v4,/\.mobile-v4-profile-icon\{[\s\S]*?padding:0;border:0;border-radius:0;/);
  assert.match(v4,/background:transparent;color:#d3efe7/);
  assert.match(v4,/box-shadow:none;cursor:pointer/);
  assert.match(v4,/\.mobile-v4-online-dot\{display:none!important\}/);
  assert.match(html,/id="mobileV4ProfilePopover"[^>]*hidden/);
  assert.match(js,/toggle\.addEventListener\('click'/);
});

test('approved V5 mobile top bar centers logo between the markets hamburger and profile',()=>{
  const v5=css.slice(css.indexOf('/* BALL46 MEMBER — approved mobile V5 header Markets drawer and borderless elevated defaults */'));
  assert.ok(v5.length>0);
  assert.match(html,/<button id="mobileV5MarketToggle"/);
  assert.match(html,/aria-controls="marketSidebar"/);
  assert.match(html,/<span class="mobile-v5-hamburger" aria-hidden="true">/);
  assert.match(v5,/grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.match(v5,/\.topbar a\.brand\.brand-original-lettering\{\s*justify-self:center!important/);
  assert.match(v5,/\.mobile-v4-back\{display:none!important\}/);
  assert.match(v5,/\.mobile-market-navigation\{display:none!important\}/);
  assert.doesNotMatch(html,/<nav id="mobileMarketPills"/);
  assert.match(html,/mobileV5=20261018-clean-card-top-drawer-v1/);
});
test('approved V5 reuses the real filter and Favorites sidebar as a left slide-out',()=>{
  const v5=css.slice(css.indexOf('/* BALL46 MEMBER — approved mobile V5 header Markets drawer and borderless elevated defaults */'));
  assert.match(js,/const mobileOpener=qs\('#mobileV5MarketToggle'\)/);
  assert.match(js,/const mobile=window\.matchMedia\('\(max-width:767px\)'\)/);
  assert.match(js,/for\(const trigger of \[opener,mobileOpener\]\)/);
  assert.match(js,/mobileOpener\.setAttribute\('aria-expanded',String\(shown\)\)/);
  assert.match(js,/triggerForViewport\(\)\.focus/);
  assert.match(js,/sidebar\.addEventListener\('click'/);
  assert.match(js,/if\(event\.key==='Escape'\)/);
  assert.match(v5,/transform:translate3d\(-105%,0,0\)!important/);
  assert.match(v5,/\.page-member\.market-menu-open \.member-market-sidebar\{\s*transform:translate3d\(0,0,0\)!important/);
  assert.match(v5,/#marketTabs\{\s*display:flex!important;flex-direction:column!important/);
  assert.match(html,/id="memberFavoriteNav"/);
});
test('approved V5 default match cards have no outline but soft dimensional shadows',()=>{
  const v5=css.slice(css.indexOf('/* BALL46 MEMBER — approved mobile V5 header Markets drawer and borderless elevated defaults */'));
  assert.match(v5,/\.signal-table tbody tr\.signal-row:not\(\.expanded\)\{\s*border:0!important;outline:0!important/);
  assert.match(v5,/0 10px 20px rgba\(0,0,0,\.18\)/);
  assert.match(v5,/0 2px 4px rgba\(0,0,0,\.10\)/);
  assert.match(v5,/inset 0 1px 0 rgba\(255,255,255,\.05\)!important/);
  assert.match(v5,/@media\(max-width:767px\)/);
  assert.match(js,/if\(!detailInserted && state\.expandedSignalId===row\.id\)/);
});

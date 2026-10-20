import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=(name)=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const pricing=load('pricing.html');
const login=load('login.html');
const member=load('member.html');
const css=load('styles.css');
const marker='/* BALL46 MEMBER — Pricing/Login V5 header parity with Signal Center (2026-10-20) */';
const kpiV7Marker='/* BALL46 MEMBER — Desktop KPI V7: nine live-data summary cards, one row (2026-10-20).';
const kpiV7Boundary=css.indexOf(kpiV7Marker);
assert.ok(kpiV7Boundary>css.indexOf(marker),'header tests must end before unrelated desktop KPI styles');
const added=css.slice(css.indexOf(marker),kpiV7Boundary);

function header(html){
  const start=html.indexOf('<header class="topbar">');
  const end=html.indexOf('</header>',start);
  assert.ok(start>=0&&end>start);
  return html.slice(start,end+9);
}

test('Pricing and Login retain exactly the Signal Center logo lettering and desktop navigation',()=>{
  const original=header(member);
  for(const [name,html,active] of [['pricing',pricing,'Membership'],['login',login,'Login']]){
    const top=header(html);
    assert.ok(top.includes('<div class="shell topbar-inner">'),name);
    assert.ok(top.includes('<a class="brand brand-original-lettering" href="/pricing" aria-label="ball46 Member"><span class="brand-logo">ball<span>46</span></span><span class="brand-member">MEMBER</span></a>'),name);
    for(const label of ['Membership','Login','Signal Center'])assert.ok(top.includes('>'+label+'</a>'),name+': '+label);
    assert.match(top,/<nav class="nav" aria-label="Member navigation">/);
    assert.match(top,new RegExp('href="/'+(name==='pricing'?'pricing':'login')+'" aria-current="page"'));
    assert.match(original,/id="mobileV5MarketToggle"/);
  }
});

test('Pricing and Login use usable closed-by-default hamburger navigation and 3D account icon on mobile',()=>{
  for(const [name,html,target] of [['pricing',pricing,'/login'],['login',login,'/member']]){
    const top=header(html);
    assert.match(top,/<details class="mobile-v5-site-menu">/);
    assert.doesNotMatch(top,/<details class="mobile-v5-site-menu" open/);
    assert.match(top,/<summary aria-label="Open member navigation">/);
    assert.match(top,/<nav class="mobile-v5-site-links" aria-label="Member navigation">/);
    assert.match(top,new RegExp('class="mobile-v5-site-profile-link" href="'+target+'"'));
    assert.match(top,/src="\/icons\/premium-20261018\/member-profile-72\.webp"/);
    assert.match(html,/v5headerSync=20261020-pricing-login-parity-v1/);
  }
});

test('Guest headers match member V5 geometry, Deep Teal palette, font sizing and safe closed-menu behavior',()=>{
  assert.ok(added.startsWith(marker));
  assert.match(added,/@media\(max-width:767px\)/);
  assert.match(added,/\.page-pricing \.topbar-inner\.shell,\s*\.page-login \.topbar-inner\.shell\{\s*height:57px;/);
  assert.match(added,/grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.match(added,/background:linear-gradient\(180deg,#102635,#0a1a27\)!important/);
  assert.match(added,/\.page-pricing \.topbar \.nav,\s*\.page-login \.topbar \.nav\{display:none!important\}/);
  assert.match(added,/\.mobile-v5-site-menu:not\(\[open\]\) > \.mobile-v5-site-links\{display:none!important\}/);
  assert.match(added,/\.mobile-v5-site-links a\{/);
  assert.match(added,/\.mobile-v5-site-profile-link img\{\s*width:34px;\s*height:34px;/);
  assert.match(added,/@media\(max-width:359px\)/);
  assert.doesNotMatch(added,/\.page-member/);
  assert.match(css,/\.page-member \.topbar-inner\.shell\{\s*display:grid;\s*grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.match(css,/\.page-member \.topbar a\.brand\.brand-original-lettering \.brand-logo\{[\s\S]*?font-size:27\.6px!important/);
});

test('Desktop navigation remains visible and custom mobile controls stay hidden on guest pages',()=>{
  const desktop=added.slice(0,added.indexOf('@media(max-width:767px)'));
  assert.match(desktop,/\.page-pricing \.mobile-v5-site-menu,[\s\S]*?\.page-login \.mobile-v5-site-profile-link\{display:none\}/);
  assert.doesNotMatch(desktop,/\.nav\s*\{display:none/);
});

test('desktop Pricing/Login header shell aligns exactly with Signal Center 1600px shell',()=>{
  const marker='/* BALL46 MEMBER — desktop-only guest-header width parity with Signal Center (2026-10-20) */';
  const rules=css.slice(css.indexOf(marker),kpiV7Boundary);
  assert.ok(rules.startsWith(marker),'new header width rule must exist');
  assert.match(rules,/@media\(min-width:768px\)\{\s*\.page-pricing \.topbar-inner\.shell,\s*\.page-login \.topbar-inner\.shell\{\s*width:min\(1600px,calc\(100% - 24px\)\);/);
  assert.match(css,/\.page-member \.shell\{width:min\(1600px,calc\(100% - 24px\)\)\}/);
  for(const [name,html] of [['pricing',pricing],['login',login]]){
    assert.match(header(html),/<div class="shell topbar-inner">/,name+' uses shared header grid');
    assert.match(html,/desktopHeaderParity=20261020-member-1600px-v1/,name+' stylesheet refreshed');
  }
  assert.doesNotMatch(rules,/@media\(max-width:/);
  assert.doesNotMatch(rules,/main\.shell|\.page\s*\{|\.hero|\.pricing-layout|\.member-layout/);
  assert.doesNotMatch(rules,/\.topbar \.nav|\.brand\b|\.member-chip|\.topbar-account-slot/);
});

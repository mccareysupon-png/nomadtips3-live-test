(()=>{
  'use strict';

  const SECTION_SELECTOR='body[data-page="live"] .na-match-pulse';
  const ANGLE_MIN=-78;
  const ANGLE_MAX=78;

  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const numberFrom=text=>{
    const m=String(text??'').match(/-?\d+(?:\.\d+)?/);
    return m?Number(m[0]):null;
  };
  const pct=value=>{
    const n=Number(value);
    return Number.isFinite(n)?clamp(n,0,100):null;
  };
  const setText=(node,text)=>{
    if(node&&node.textContent!==text)node.textContent=text;
  };

  function readValues(section){
    let home=null,away=null;
    const spans=[...section.querySelectorAll('.na-pressure-split span')];
    for(const span of spans){
      const text=String(span.textContent||'').trim().toUpperCase();
      const value=pct(numberFrom(text));
      if(value===null)continue;
      if(text.includes('HOME'))home=value;
      if(text.includes('AWAY'))away=value;
    }

    if(home===null){
      const fallback=section.querySelector('.na-pressure-ring strong')?.textContent||section.querySelector('.na-pressure-ring')?.textContent||'';
      home=pct(numberFrom(fallback));
    }
    if(home===null&&away!==null)home=pct(100-away);
    if(away===null&&home!==null)away=pct(100-home);
    if(home===null||away===null)return null;

    return {home:Number(home.toFixed(1)),away:Number(away.toFixed(1))};
  }

  function angleFromHome(home){
    return ANGLE_MIN+(clamp(home,0,100)/100)*(ANGLE_MAX-ANGLE_MIN);
  }

  function stateLabel(home,away){
    const gap=Math.abs(home-away);
    if(gap<4)return 'BALANCED';
    if(home>away)return home>=65?'HOME CONTROL':'HOME EDGE';
    return away>=65?'AWAY CONTROL':'AWAY EDGE';
  }

  function faceMarkup(){
    return `<svg class="na-vg-face" viewBox="0 0 220 145" preserveAspectRatio="none" aria-hidden="true">
      <rect x="9" y="8" width="202" height="129" rx="10" fill="#201812" stroke="#805426" stroke-width="2"/>
      <rect x="15" y="14" width="190" height="117" rx="8" fill="#d9c79a" stroke="#33271d" stroke-width="2"/>
      <path d="M31 109 A79 79 0 0 1 110 30" fill="none" stroke="#88928f" stroke-width="7" stroke-linecap="round"/>
      <path d="M110 30 A79 79 0 0 1 189 109" fill="none" stroke="#b97b2f" stroke-width="7" stroke-linecap="round"/>
      <path d="M37 109 A73 73 0 0 1 183 109" fill="none" stroke="#4b4033" stroke-width="1.5" opacity=".88"/>
      <g stroke="#32291f" stroke-linecap="round">
        <line x1="35" y1="109" x2="47" y2="109" stroke-width="2.5"/>
        <line x1="39" y1="87" x2="50" y2="90" stroke-width="1.4"/>
        <line x1="49" y1="67" x2="59" y2="73" stroke-width="1.4"/>
        <line x1="65" y1="50" x2="73" y2="59" stroke-width="1.4"/>
        <line x1="85" y1="37" x2="90" y2="49" stroke-width="2"/>
        <line x1="110" y1="32" x2="110" y2="45" stroke-width="2.5"/>
        <line x1="135" y1="37" x2="130" y2="49" stroke-width="2"/>
        <line x1="155" y1="50" x2="147" y2="59" stroke-width="1.4"/>
        <line x1="171" y1="67" x2="161" y2="73" stroke-width="1.4"/>
        <line x1="181" y1="87" x2="170" y2="90" stroke-width="1.4"/>
        <line x1="185" y1="109" x2="173" y2="109" stroke-width="2.5"/>
      </g>
      <g fill="#433729" font-family="Arial,Helvetica,sans-serif" font-weight="900">
        <text x="30" y="124" font-size="9" letter-spacing="1.2">AWAY</text>
        <text x="110" y="52" font-size="9" text-anchor="middle">50</text>
        <text x="190" y="124" font-size="9" text-anchor="end" letter-spacing="1.2">HOME</text>
      </g>
      <text x="110" y="68" fill="#76603e" font-family="Arial,Helvetica,sans-serif" font-size="5.5" font-weight="900" text-anchor="middle" letter-spacing="1.2">PRESSURE SHARE</text>
      <circle cx="24" cy="23" r="3.2" fill="#8d5725" stroke="#3a2312" stroke-width="1"/>
      <circle cx="196" cy="23" r="3.2" fill="#8d5725" stroke="#3a2312" stroke-width="1"/>
      <circle cx="24" cy="122" r="3.2" fill="#8d5725" stroke="#3a2312" stroke-width="1"/>
      <circle cx="196" cy="122" r="3.2" fill="#8d5725" stroke="#3a2312" stroke-width="1"/>
    </svg>`;
  }

  function gaugeMarkup(){
    return `<div class="na-vg" role="img" aria-label="Live pressure balance">
      <div class="na-vg-instrument">
        ${faceMarkup()}
        <div class="na-vg-nameplate">MATCH PULSE</div>
        <div class="na-vg-state" data-vg-state>BALANCED</div>
        <i class="na-vg-needle" aria-hidden="true"></i>
        <i class="na-vg-cap" aria-hidden="true"></i>
      </div>
      <div class="na-vg-readout" aria-hidden="true">
        <span class="away" data-vg-away>AWAY —</span>
        <span class="home" data-vg-home>HOME —</span>
      </div>
    </div>`;
  }

  function ensureGauge(section){
    let gauge=section.querySelector(':scope .na-vg');
    if(gauge){section.classList.add('vg-ready');return gauge;}

    const wrap=section.querySelector('.na-pressure-wrap');
    if(!wrap)return null;
    const holder=document.createElement('div');
    holder.innerHTML=gaugeMarkup();
    gauge=holder.firstElementChild;
    if(!gauge)return null;

    const ring=wrap.querySelector(':scope > .na-pressure-ring');
    if(ring)wrap.insertBefore(gauge,ring);
    else wrap.prepend(gauge);
    section.classList.add('vg-ready');
    return gauge;
  }

  function updateGauge(section){
    const values=readValues(section);
    if(!values)return;
    const gauge=ensureGauge(section);
    if(!gauge)return;

    const angle=angleFromHome(values.home);
    gauge.style.setProperty('--vg-angle',`${angle.toFixed(2)}deg`);
    setText(gauge.querySelector('[data-vg-away]'),`AWAY ${values.away.toFixed(1)}%`);
    setText(gauge.querySelector('[data-vg-home]'),`HOME ${values.home.toFixed(1)}%`);
    setText(gauge.querySelector('[data-vg-state]'),stateLabel(values.home,values.away));
    gauge.setAttribute('aria-label',`Live pressure: AWAY ${values.away.toFixed(1)} percent, HOME ${values.home.toFixed(1)} percent`);
  }

  function hydrateAll(){
    document.querySelectorAll(SECTION_SELECTOR).forEach(updateGauge);
  }

  let queued=false;
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;hydrateAll();});
  }

  function start(){
    if(document.body?.dataset?.page!=='live')return;
    hydrateAll();
    const list=document.getElementById('matchList');
    if(list)new MutationObserver(queue).observe(list,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();

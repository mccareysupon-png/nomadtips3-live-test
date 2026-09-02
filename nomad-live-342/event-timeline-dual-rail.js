(()=>{
  'use strict';

  const ICON_BASE='assets/event-icons/';
  const ICONS={
    'SOT':'sot.webp',
    'SHOT OFF':'shot-off.webp',
    'CORNER':'corner.webp'
  };
  const LABELS={
    'SOT':'SOT',
    'SHOT OFF':'OFF',
    'CORNER':'COR'
  };
  const TICKS=[0,15,30,45,60,75,90];

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const numberFrom=value=>{
    const match=String(value??'').match(/\d+(?:\.\d+)?/);
    return match?Number(match[0]):null;
  };
  const normalizeLabel=value=>{
    const text=String(value??'').toUpperCase().replace(/\s*×\s*\d+\s*$/,'').trim();
    if(text==='SOT'||text.includes('ON TARGET'))return 'SOT';
    if(text==='SHOT OFF'||text==='OFF'||text.includes('OFF TARGET'))return 'SHOT OFF';
    if(text.startsWith('CORNER'))return 'CORNER';
    return text;
  };
  const teamText=(card,index,fallback)=>{
    const teams=card?.querySelectorAll('.teams-line strong');
    const text=String(teams?.[index]?.textContent||'').trim();
    return text||fallback;
  };
  const currentMinute=card=>{
    const raw=String(card?.querySelector('.live-minute')?.textContent||'').trim();
    if(/^HT$/i.test(raw))return {value:45,label:'HT'};
    if(/^FT$/i.test(raw))return {value:90,label:'FT'};
    const value=numberFrom(raw);
    return value===null?null:{value,label:`${value}'`};
  };
  const assignLanes=events=>{
    for(const side of ['HOME','AWAY']){
      const rows=events.filter(event=>event.side===side).sort((a,b)=>a.minute-b.minute);
      let previous=-999,lane=0;
      for(const event of rows){
        lane=Math.abs(event.minute-previous)<5?(lane+1)%2:0;
        event.lane=lane;
        previous=event.minute;
      }
    }
  };
  const eventMarkup=event=>{
    const position=clamp((event.minute/90)*100,0,100);
    const icon=ICONS[event.label]||ICONS.SOT;
    const short=LABELS[event.label]||event.label;
    const count=event.count>1?` ×${event.count}`:'';
    return `<div class="na-timeline-event ${event.side==='HOME'?'home':'away'} na-rail-event na-event-${event.label.toLowerCase().replace(/\s+/g,'-')}" style="--x:${position.toFixed(3)}%;--lane:${event.lane||0}" title="${esc(`${event.minute}' · ${event.side} · ${event.label}${count}`)}"><strong>${esc(short)}${esc(count)}</strong><img class="na-event-icon" src="${ICON_BASE}${icon}" alt="" aria-hidden="true" draggable="false"><i class="na-event-stem"></i><span>${esc(event.minute)}'</span><small>${esc(event.side)}</small></div>`;
  };
  const ticksMarkup=()=>TICKS.map(minute=>`<span class="na-time-tick${minute===45?' is-half':''}" style="--x:${(minute/90*100).toFixed(3)}%"><i></i><b>${minute===45?'HT':`${minute}'`}</b></span>`).join('');
  const legendMarkup=()=>[
    ['sot.webp','SOT'],
    ['shot-off.webp','SHOT OFF'],
    ['corner.webp','CORNER']
  ].map(([icon,label])=>`<span><img src="${ICON_BASE}${icon}" alt="" aria-hidden="true" draggable="false"><b>${label}</b></span>`).join('');
  const railMarkup=(side,team,events)=>`<div class="na-dual-row ${side.toLowerCase()}"><div class="na-dual-team"><b>${side}</b><small title="${esc(team)}">${esc(team)}</small></div><div class="na-dual-line"></div>${events.filter(event=>event.side===side).map(eventMarkup).join('')}</div>`;

  function transformTimeline(timeline){
    if(!timeline||timeline.dataset.dualRailReady==='1')return;
    const card=timeline.closest('.event-compact');
    if(!card)return;

    const events=[...timeline.querySelectorAll(':scope > .na-timeline-event')].map(node=>{
      const minute=numberFrom(node.querySelector('span')?.textContent);
      const label=normalizeLabel(node.querySelector('strong')?.textContent);
      const side=node.classList.contains('home')?'HOME':node.classList.contains('away')?'AWAY':String(node.querySelector('small')?.textContent||'').toUpperCase();
      const countMatch=String(node.querySelector('strong')?.textContent||'').match(/×\s*(\d+)/);
      return {minute,label,side,count:countMatch?Number(countMatch[1]):1,lane:0};
    }).filter(event=>Number.isFinite(event.minute)&&ICONS[event.label]&&(event.side==='HOME'||event.side==='AWAY'));

    assignLanes(events);
    const home=teamText(card,0,'HOME');
    const away=teamText(card,1,'AWAY');
    const live=currentMinute(card);
    const livePosition=live?clamp((live.value/90)*100,0,100):null;
    const empty=events.length?'':`<div class="na-dual-empty-note">NO RECENT SOT / SHOT OFF / CORNER CHANGE</div>`;
    const now=live?`<div class="na-timeline-now-track"><div class="na-timeline-now" style="--x:${livePosition.toFixed(3)}%"><b>${esc(live.label)}</b><i></i></div></div>`:'';

    timeline.dataset.dualRailReady='1';
    timeline.classList.add('na-dual-timeline');
    timeline.innerHTML=`<div class="na-dual-head"><div class="na-dual-legend">${legendMarkup()}</div><span>HOME / AWAY · 0–90'</span></div><div class="na-dual-stage">${railMarkup('HOME',home,events)}${railMarkup('AWAY',away,events)}${now}<div class="na-time-axis">${ticksMarkup()}</div>${empty}</div>`;
  }

  const scan=root=>{
    const scope=root?.querySelectorAll?root:document;
    scope.querySelectorAll('.na-timeline').forEach(transformTimeline);
    if(scope.matches?.('.na-timeline'))transformTimeline(scope);
  };

  function start(){
    if(document.body?.dataset?.page!=='live')return;
    const list=document.getElementById('matchList');
    if(!list)return;
    let queued=false;
    const queue=()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;scan(list)});
    };
    new MutationObserver(queue).observe(list,{childList:true,subtree:true});
    list.addEventListener('click',()=>setTimeout(queue,0));
    list.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')setTimeout(queue,0)});
    queue();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

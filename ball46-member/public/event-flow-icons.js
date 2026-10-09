// Browser-safe Event Flow marker helpers. Pure logic, no premium data or network access.
(function(root){
  'use strict';
  const names={goal:'Goal',corner:'Corner',yellow:'Yellow card',red:'Red card',
    penalty:'Penalty',var:'VAR',sub:'Substitution',card:'Card',other:'Match event'};
  const ranks={goal:0,red:1,penalty:2,var:3,yellow:4,corner:5,sub:6,card:7,other:8};
  function kind(event){
    const text=[event?.type,event?.detail].filter(Boolean).join(' ').toLowerCase();
    if(/\b(disallowed|ruled out|cancelled|canceled|var)\b/.test(text))return 'var';
    if(/\b(red card|straight red|second yellow|redcard|red_card)\b/.test(text))return 'red';
    if(/\b(yellow card|yellowcard|yellow_card|booking)\b/.test(text))return 'yellow';
    if(/\b(corner|corner kick|cornerkick)\b/.test(text))return 'corner';
    if(/\b(goal|scored|own goal)\b/.test(text))return 'goal';
    if(/\b(penalty|spot kick)\b/.test(text))return 'penalty';
    if(/\b(substitution|substituted|sub on|sub off)\b/.test(text))return 'sub';
    if(/\bcard\b/.test(text))return 'card';
    return 'other';
  }
  function icon(k){
    return ({goal:'⚽',corner:'🚩',yellow:'',red:'',penalty:'◎',var:'VAR',
      sub:'⇄',card:'▰',other:'•'})[k]||'•';
  }
  function label(e,home='HOME',away='AWAY'){
    const minute=Number(e?.minute);
    const time=Number.isInteger(minute)?String(minute):Number.isFinite(minute)?String(Math.round(minute*10)/10):'?';
    const k=kind(e),who=String(e?.team||'').trim()||(e?.side==='home'?home:e?.side==='away'?away:'');
    const detail=String(e?.detail||'').trim();
    const words=[time+"'",names[k],who];
    if(detail && !detail.toLowerCase().includes(names[k].toLowerCase()))words.push(detail);
    if(e?.approximate)words.push('approximate minute from history snapshots');
    return words.filter(Boolean).join(' · ');
  }
  function merge(history,live,sideOf){
    const map=new Map();
    // Snapshot-derived times are observations, not exact event timestamps.
    for(const [source,approximate] of [[history,true],[live,false]]){
      for(const item of (Array.isArray(source)?source:[])){
        const minute=Number(item?.minute);
        if(!Number.isFinite(minute)||minute<0||minute>135)continue;
        const e={...item,minute,side:sideOf(item)||null,approximate};
        const id=[Math.round(minute*10)/10,kind(e),e.side||String(e.team||'').toLowerCase()].join('|');
        if(!map.has(id)||!approximate)map.set(id,e);
      }
    }
    return [...map.values()].sort((a,b)=>a.minute-b.minute);
  }
  function group(events,current,mobile=false){
    const minutes=Number(current);
    const gap=mobile?Math.max(2,Math.ceil(minutes/24)):Math.max(1,Math.ceil(minutes/55));
    const sorted=(Array.isArray(events)?events:[]).filter(e=>
      Number.isFinite(Number(e?.minute))&&Number(e.minute)>=0&&Number(e.minute)<=minutes+.75)
      .sort((a,b)=>Number(a.minute)-Number(b.minute));
    const clusters=[];
    for(const e of sorted){
      const side=e.side||'neutral';
      const prev=[...clusters].reverse().find(g=>g.side===side&&
        Math.abs(Number(e.minute)-Number(g.events[0].minute))<=gap);
      if(prev)prev.events.push(e);
      else clusters.push({side,events:[e]});
    }
    return clusters.map(g=>{
      const sortedByImportance=g.events.slice().sort((a,b)=>
        ranks[kind(a)]-ranks[kind(b)]||Number(a.minute)-Number(b.minute));
      return {...g,primary:sortedByImportance[0],kind:kind(sortedByImportance[0])};
    });
  }
  root.Ball46EventIcons=Object.freeze({kind,icon,label,merge,group,names});
})(globalThis);

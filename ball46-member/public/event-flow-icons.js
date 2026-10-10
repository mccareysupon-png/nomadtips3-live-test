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
  // Reconcile independently observed match events. Engine Signal timestamps
  // are deliberately never used as a source of goals/cards/corners.
  function merge(history,live,sideOf,score=null){
    const valid=item=>{
      const minute=item?.minute==null?NaN:Number(item.minute);
      return Number.isFinite(minute)&&minute>=0&&minute<=135;
    };
    const normalize=(item,approximate)=>({...item,minute:Number(item.minute),
      side:sideOf(item)||null,approximate});
    const actual=[];
    const seenLive=new Set();
    for(const item of (Array.isArray(live)?live:[])){
      if(!valid(item))continue;
      const e=normalize(item,false),category=kind(e);
      // An upstream event repeated verbatim should not create a second icon.
      // Different event IDs/details are retained, including two real goals
      // scored by the same team at the same minute.
      const id=e.eventId??e.id??null;
      const key=id!=null?'id:'+String(id):
        [Math.round(e.minute*10)/10,category,e.side||String(e.team||'').trim().toLowerCase(),
          String(e.detail||'').trim().toLowerCase()].join('|');
      if(seenLive.has(key))continue;
      seenLive.add(key);
      actual.push(e);
    }

    const historyRows=(Array.isArray(history)?history:[]).filter(valid)
      .map(e=>normalize(e,true)).sort((a,b)=>a.minute-b.minute);
    const liveMatches=new Set();
    const fallback=[];
    const MAX_SNAPSHOT_DELAY_MINUTES=6;
    for(const snap of historyRows){
      const category=kind(snap);
      let bestIndex=-1,bestGap=Infinity;
      for(let i=0;i<actual.length;i++){
        const event=actual[i];
        if(liveMatches.has(i)||kind(event)!==category)continue;
        // One unidentified team may match a known side, never two known
        // opposing sides. A snapshot can be timestamped later than the goal.
        if(event.side&&snap.side&&event.side!==snap.side)continue;
        const gap=Math.abs(event.minute-snap.minute);
        if(gap<=MAX_SNAPSHOT_DELAY_MINUTES&&gap<bestGap){
          bestGap=gap;bestIndex=i;
        }
      }
      if(bestIndex!==-1){
        liveMatches.add(bestIndex);
        if(!actual[bestIndex].side&&snap.side)actual[bestIndex].side=snap.side;
      }else fallback.push(snap);
    }

    // Scoreboard is a safety net for delayed snapshots. It limits only
    // reconstructed GOAL icons, never confirmed real feed events. Example:
    // FT 1-0 with a real 21' goal must not show an extra snapshot goal at 28'.
    const allowedBySide={};
    for(const side of ['home','away']){
      const value=score?.[side];
      const goals=value==null?NaN:Number(value);
      if(Number.isInteger(goals)&&goals>=0){
        const exact=actual.filter(e=>kind(e)==='goal'&&e.side===side).length;
        allowedBySide[side]=Math.max(0,goals-exact);
      }
    }
    const result=[...actual];
    for(const e of fallback){
      if(kind(e)==='goal'&&Object.hasOwn(allowedBySide,e.side)){
        if(!allowedBySide[e.side])continue;
        allowedBySide[e.side]--;
      }
      result.push(e);
    }
    return result.sort((a,b)=>a.minute-b.minute||
      Number(a.approximate)-Number(b.approximate));
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
      const category=kind(e);
      // Separate GOAL from CORNER/CARD/VAR even at the same minute.
      // Only repeated instances of the *same* event category may cluster.
      const prev=[...clusters].reverse().find(g=>g.side===side&&g.category===category&&
        Math.abs(Number(e.minute)-Number(g.events[0].minute))<=gap);
      if(prev)prev.events.push(e);
      else clusters.push({side,category,events:[e]});
    }
    return clusters.map(g=>{
      const sortedByImportance=g.events.slice().sort((a,b)=>
        ranks[kind(a)]-ranks[kind(b)]||Number(a.minute)-Number(b.minute));
      return {...g,primary:sortedByImportance[0],kind:kind(sortedByImportance[0])};
    });
  }
  root.Ball46EventIcons=Object.freeze({kind,icon,label,merge,group,names});
})(globalThis);

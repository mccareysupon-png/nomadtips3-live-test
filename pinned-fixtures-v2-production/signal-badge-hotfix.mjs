export const OLD_PINNED_RENDER="if(pinned.length){structure.push(['pinned',pinned.length,1,pinned.map(fixtureKey)]);html.push('<section class=\\\"status-section b46-pin-v2-section\\\" data-status-section=\\\"pinned\\\"><header class=\\\"status-head\\\"><div><i class=\\\"status-dot upcoming\\\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header><section class=\\\"league-block\\\">'+pinned.map(rowHtml).join('')+'</section></section>')}";

export const NEW_PINNED_RENDER="if(pinned.length){const pinnedGroups=groupByLeague(pinned);structure.push(['pinned',pinned.length,1,pinnedGroups.map(([league,list])=>[league,list.map(fixtureKey)])]);html.push('<section class=\\\"status-section b46-pin-v2-section\\\" data-status-section=\\\"pinned\\\"><header class=\\\"status-head\\\"><div><i class=\\\"status-dot upcoming\\\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header>'+pinnedGroups.map(([league,list])=>'<section class=\\\"league-block\\\"><header class=\\\"league-head\\\"><strong>'+esc(league)+'</strong><span>'+list.length+' match'+(list.length===1?'':'es')+'</span></header>'+list.map(rowHtml).join('')+'</section>').join('')+'</section>')}";

export function jsStringEscape(s){
  return JSON.stringify(s).slice(1,-1);
}

export function patchSignalBadgeContext(src,{escaped=false}={}){
  const old=escaped?jsStringEscape(OLD_PINNED_RENDER):OLD_PINNED_RENDER;
  const neu=escaped?jsStringEscape(NEW_PINNED_RENDER):NEW_PINNED_RENDER;
  const count=src.split(old).length-1;
  if(count!==1)throw new Error('PINNED_RENDER_ANCHOR_COUNT_'+count+(escaped?'_ESCAPED':''));
  const out=src.replace(old,neu);
  if(out===src)throw new Error('NO_PATCH_CHANGE');
  return out;
}

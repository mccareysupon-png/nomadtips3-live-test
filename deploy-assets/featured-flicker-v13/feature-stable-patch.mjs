/* BALL46 V13. Pure asset transformation; no stats logic, feed or Event Flow edits. */
export const TARGET='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const OLD_LEAGUE="setText('[data-featured-league]',leagueName(f));";
export const NEW_LEAGUE="b46StableFeaturedLeague(leagueName(f));";
export const OLD_CONTENT="const facts=$('[data-featured-facts]');if(facts)facts.innerHTML=featureFactsHtml(f);const stats=$('[data-featured-stats]');if(stats)stats.innerHTML=statHtml(f);const events=$('[data-featured-events]');if(events)events.innerHTML=eventsHtml(f)";
export const NEW_CONTENT="b46StableFeaturedContent($('[data-featured-facts]'),featureFactsHtml(f),'facts');b46StableFeaturedContent($('[data-featured-stats]'),statHtml(f),'stats');b46StableFeaturedContent($('[data-featured-events]'),eventsHtml(f),'events')";
export const HELPER=String.raw`
/* B46_V13_FEATURED_STABLE_RENDER: do not unmount live UI on identical refresh */
function b46StableFeaturedLeague(next){
 const el=$('[data-featured-league]');if(!el)return;
 // Keep the flag element mounted; replacing the league container's textContent
 // destroys the image and allows the globe placeholder to reappear.
 const label=el.querySelector(':scope > .league-label');
 if(label){if(label.textContent!==next)label.textContent=next;return;}
 const nodes=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
 const textNode=nodes[nodes.length-1];
 if(textNode){if(textNode.textContent!==next)textNode.textContent=next;return;}
 const span=document.createElement('span');span.className='league-label';span.textContent=next;el.appendChild(span);
}
function b46StableFeaturedContent(host,markup,kind){
 if(!host)return;
 // Strongest guard: avoid any DOM mutation while output data is unchanged.
 if(host.dataset.b46V13Raw===markup)return;
 const tmp=document.createElement('template');tmp.innerHTML=markup;
 const incoming=[...tmp.content.children],existing=[...host.children];
 const textUpdate=(a,b)=>{if(a&&b&&a.textContent!==b.textContent)a.textContent=b.textContent};
 let updated=false;
 // Keep the existing recessed wells, even as ODDS AGE advances each second.
 if(kind==='facts'&&incoming.length===4&&existing.length===4&&
   existing.every((n,i)=>n.tagName==='DIV'&&n.querySelector('span')&&n.querySelector('b')&&
   incoming[i].querySelector('span')&&incoming[i].querySelector('b'))){
   existing.forEach((n,i)=>{textUpdate(n.querySelector('span'),incoming[i].querySelector('span'));
     textUpdate(n.querySelector('b'),incoming[i].querySelector('b'))});
   updated=true;
 }else if(kind==='stats'&&incoming.length>0&&existing.length===incoming.length&&
   existing.every((n,i)=>n.classList.contains('stat-row')&&incoming[i].classList.contains('stat-row')&&
   n.querySelectorAll(':scope > b').length===2&&incoming[i].querySelectorAll(':scope > b').length===2&&
   n.querySelectorAll('.stat-track > i').length===2&&incoming[i].querySelectorAll('.stat-track > i').length===2)){
   existing.forEach((n,i)=>{
    const t=incoming[i];
    const oldNums=n.querySelectorAll(':scope > b'),newNums=t.querySelectorAll(':scope > b');
    textUpdate(oldNums[0],newNums[0]);textUpdate(oldNums[1],newNums[1]);
    textUpdate(n.querySelector(':scope > span'),t.querySelector(':scope > span'));
    const oldBars=n.querySelectorAll('.stat-track > i'),newBars=t.querySelectorAll('.stat-track > i');
    for(let k=0;k<2;k++){const w=newBars[k].style.width;if(oldBars[k].style.width!==w)oldBars[k].style.width=w;}
   });updated=true;
 }else if(kind==='events'&&incoming.length>0&&existing.length===incoming.length&&
   existing.every((n,i)=>n.className===incoming[i].className&&
    (n.classList.contains('event-item')?
       (n.querySelector('time')&&n.querySelector('span')&&incoming[i].querySelector('time')&&incoming[i].querySelector('span')):true))){
   existing.forEach((n,i)=>{
     if(n.classList.contains('event-item')){
       textUpdate(n.querySelector('time'),incoming[i].querySelector('time'));
       textUpdate(n.querySelector('span'),incoming[i].querySelector('span'));
     }else if(n.classList.contains('feature-empty')||n.classList.contains('event-title'))textUpdate(n,incoming[i]);
   });updated=true;
 }
 if(!updated)host.innerHTML=markup;
 host.dataset.b46V13Raw=markup;
}
`;
export function patchRenderer(src){
 const anchors=[[OLD_LEAGUE,NEW_LEAGUE],[OLD_CONTENT,NEW_CONTENT]];
 for(const [before] of anchors)if(src.split(before).length!==2)throw Error('B46_V13_SOURCE_DRIFT '+before.slice(0,70));
 if(src.includes('B46_V13_FEATURED_STABLE_RENDER'))throw Error('ALREADY_INSTALLED_V13');
 let out=src;for(const [before,after] of anchors)out=out.replace(before,()=>after);
 const marker='function renderFeatured(){';
 if(out.split(marker).length!==2)throw Error('FEATURED_FUNCTION_DRIFT');
 out=out.replace(marker,()=>HELPER+'\n'+marker);
 if(!out.includes('b46StableFeaturedContent')||!out.includes('b46StableFeaturedLeague'))throw Error('V13_PATCH_FAILED');
 return out;
}

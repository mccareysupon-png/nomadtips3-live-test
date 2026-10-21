/* Preview V2: RESTYLE THE EXISTING FEATURED MATCH — NO CLONES OR NEW CARDS.
   All data fields remain in their original DOM nodes, owned by production renderer. */
export const FEATURED_PREVIEW_MARKER='b46-featured-clean-preview-v1-20261021';
export const FEATURED_PREVIEW_SCRIPT=String.raw`(function(){
'use strict';
if(window.__b46FeaturedCleanPreviewV2Installed)return;
window.__b46FeaturedCleanPreviewV2Installed=true;
function sync(){
 const source=document.querySelector('.featured-card[data-featured]');
 if(!source)return;
 // Never append, clone, reparent, overwrite or change the original feed fields.
 source.classList.add('b46fm-inplace');
 // Clean up earlier-preview nodes defensively (never production widgets).
 for(const node of document.querySelectorAll('.b46fm-preview-pc,.b46fm-preview-mobile'))node.remove();
 const panel=source.querySelector('.feature-events');
 if(panel&&panel.querySelectorAll('.event-item').length>3){
  let button=panel.querySelector('.b46fm-events-more');
  if(!button){
   button=document.createElement('button');
   button.type='button';button.className='b46fm-events-more';
   button.addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopPropagation();
    const expanded=source.classList.toggle('b46fm-all-events');
    const state=String(expanded);
    const label=expanded?'Show fewer events ↑':'View all events ↓';
    if(button.getAttribute('aria-expanded')!==state)button.setAttribute('aria-expanded',state);
    if(button.textContent!==label)button.textContent=label;
   });
   panel.appendChild(button);
  }
  const expanded=source.classList.contains('b46fm-all-events');
  const state=String(expanded);
  const label=expanded?'Show fewer events ↑':'View all events ↓';
  // The live feed polls; repeated textContent writes reset the control every
  // 1.4 s and can visibly flash/focus-jump when the user expands events.
  if(button.getAttribute('aria-expanded')!==state)button.setAttribute('aria-expanded',state);
  if(button.textContent!==label)button.textContent=label;
 }else panel?.querySelector('.b46fm-events-more')?.remove();
}
const start=()=>{sync();setInterval(sync,1400)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;

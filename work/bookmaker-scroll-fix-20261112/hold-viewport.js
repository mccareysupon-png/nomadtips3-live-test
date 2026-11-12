 function holdMarketViewport(node){
   const saved=[];
   for(let el=node?.parentElement;el;el=el.parentElement){
     if(el===document.scrollingElement||(/auto|scroll|overlay/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight)){
       saved.push({el,top:el.scrollTop,left:el.scrollLeft,anchor:el.style.getPropertyValue('overflow-anchor'),anchorPriority:el.style.getPropertyPriority('overflow-anchor'),behavior:el.style.getPropertyValue('scroll-behavior'),behaviorPriority:el.style.getPropertyPriority('scroll-behavior')});
       el.style.setProperty('overflow-anchor','none','important');el.style.setProperty('scroll-behavior','auto','important');
     }
   }
   const restore=()=>{for(const s of saved){s.el.scrollTop=s.top;s.el.scrollLeft=s.left}};
   return()=>{restore();requestAnimationFrame(()=>{restore();for(const s of saved){if(s.anchor)s.el.style.setProperty('overflow-anchor',s.anchor,s.anchorPriority);else s.el.style.removeProperty('overflow-anchor');if(s.behavior)s.el.style.setProperty('scroll-behavior',s.behavior,s.behaviorPriority);else s.el.style.removeProperty('scroll-behavior')}})};
 }

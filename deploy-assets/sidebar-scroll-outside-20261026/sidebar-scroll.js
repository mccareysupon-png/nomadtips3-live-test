(()=>{
 'use strict';
 const mq=matchMedia('(min-width:761px)');let cleanup;
 function mount(){
  if(cleanup){cleanup();cleanup=null;}
  const rail=document.querySelector('.workspace.singlepage>aside.left-rail');
  if(!mq.matches||!rail)return;
  const originalGutter=rail.offsetWidth-rail.clientWidth;
  const padding=parseFloat(getComputedStyle(rail).paddingRight)||0;
  const track=document.createElement('div'),spacer=document.createElement('div');
  track.className='b46-sidebar-outside-scroll';track.setAttribute('aria-label','Scroll sidebar menu');track.tabIndex=0;
  track.append(spacer);document.body.append(track);
  rail.style.setProperty('--b46-scroll-padding',`${padding+originalGutter}px`);
  rail.classList.add('b46-scroll-external');
  let frame=0;
  function layout(){frame=0;const r=rail.getBoundingClientRect();track.style.left=`${r.right+2}px`;track.style.top=`${Math.max(0,r.top+8)}px`;const height=Math.max(0,Math.min(r.bottom-8,innerHeight)-Math.max(0,r.top+8));track.style.height=`${height}px`;spacer.style.height=`${Math.max(height,height+rail.scrollHeight-rail.clientHeight)}px`;track.hidden=height<20||rail.scrollHeight<=rail.clientHeight;track.scrollTop=rail.scrollTop;}
  function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
  function fromRail(){if(Math.abs(track.scrollTop-rail.scrollTop)>1)track.scrollTop=rail.scrollTop;}
  function fromTrack(){if(Math.abs(rail.scrollTop-track.scrollTop)>1)rail.scrollTop=track.scrollTop;}
  rail.addEventListener('scroll',fromRail,{passive:true});track.addEventListener('scroll',fromTrack,{passive:true});
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,{passive:true});
  const resize=new ResizeObserver(schedule);resize.observe(rail);
  const mutation=new MutationObserver(schedule);mutation.observe(rail,{childList:true,subtree:true,characterData:true});
  layout();
  cleanup=()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();rail.removeEventListener('scroll',fromRail);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule);track.remove();rail.classList.remove('b46-scroll-external');rail.style.removeProperty('--b46-scroll-padding');};
 }
 mq.addEventListener('change',mount);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

(()=>{
  const buttons=[...document.querySelectorAll('.metric-info[data-tooltip]')];
  if(!buttons.length)return;

  const tip=document.createElement('div');
  tip.id='metricTooltip';
  tip.className='metric-tooltip-floating';
  tip.setAttribute('role','tooltip');
  tip.hidden=true;
  document.body.append(tip);

  let active=null;

  const position=button=>{
    if(!button||tip.hidden)return;
    const rect=button.getBoundingClientRect();
    const gap=7;
    const edge=8;
    const width=tip.offsetWidth;
    const height=tip.offsetHeight;
    let left=rect.left+(rect.width/2)-(width/2);
    left=Math.max(edge,Math.min(left,window.innerWidth-width-edge));
    let top=rect.top-height-gap;
    if(top<edge)top=rect.bottom+gap;
    tip.style.left=`${Math.round(left)}px`;
    tip.style.top=`${Math.round(top)}px`;
  };

  const show=button=>{
    const text=button?.dataset?.tooltip;
    if(!text)return;
    active=button;
    tip.textContent=text;
    tip.hidden=false;
    button.setAttribute('aria-describedby',tip.id);
    requestAnimationFrame(()=>position(button));
  };

  const hide=button=>{
    const target=button||active;
    if(target)target.removeAttribute('aria-describedby');
    active=null;
    tip.hidden=true;
  };

  buttons.forEach(button=>{
    button.addEventListener('mouseenter',()=>show(button));
    button.addEventListener('mouseleave',()=>{
      if(document.activeElement!==button)hide(button);
    });
    button.addEventListener('focus',()=>show(button));
    button.addEventListener('blur',()=>hide(button));
    button.addEventListener('pointerdown',event=>{
      if(event.pointerType&&event.pointerType!=='mouse')show(button);
    });
  });

  document.addEventListener('pointerdown',event=>{
    if(active&&!event.target.closest('.metric-info'))hide(active);
  },true);
  window.addEventListener('scroll',()=>{if(active)position(active);},{passive:true});
  window.addEventListener('resize',()=>{if(active)position(active);});
})();

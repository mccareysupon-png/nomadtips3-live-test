export const OVERLAY_MARK='b46-mobile-ultrasoft-flow-v3-20261020';
export const OVERLAY_HTML=String.raw`<style id="b46-mobile-ultrasoft-flow-v3-20261020">
@media(max-width:767px){
.expand-flow-chart.b46-mf-chart .expand-flow-line.home{stroke:#4ce0a0!important;stroke-width:1.05px!important;stroke-linecap:round!important;stroke-linejoin:round!important;}
.expand-flow-chart.b46-mf-chart .expand-flow-line.away{stroke:#edcb69!important;stroke-width:.95px!important;stroke-linecap:round!important;stroke-linejoin:round!important;}
.expand-flow-chart.b46-mf-chart .expand-flow-area{opacity:.42!important;}
}
</style>
<script>
(function(){
 'use strict';
 if(window.__b46MobileFlowUltraSoftV3Installed)return;
 window.__b46MobileFlowUltraSoftV3Installed=true;
 const mq=window.matchMedia('(max-width:767px)');
 const NS='http://www.w3.org/2000/svg';
 const tracked=new Map();
 let scheduled=false,nextId=0;
 function pointsFromPath(d){
  if(!d||/(^|\s)C\s/i.test(d))return null;
  const re=/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gi,pts=[];
  let m;while((m=re.exec(d)))pts.push({x:Number(m[1]),y:Number(m[2])});
  if(pts.length<2||pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  for(let i=1;i<pts.length;i++)if(pts[i].x<=pts[i-1].x)return null;
  return pts;
 }
 function smooth(pts,current,viewWidth){
  const minute=x=>Math.max(0,(x-36)/Math.max(1,viewWidth-56)*current);
  return pts.map(p=>{
   let sum=0,weight=0;
   for(const q of pts){
    const dist=Math.abs(minute(p.x)-minute(q.x));
    if(dist>5)continue;
    const w=6-dist;sum+=q.y*w;weight+=w;
   }
   return{x:p.x,y:weight?sum/weight:p.y};
  });
 }
 function curve(pts){
  const n=pts.length,sec=[],slope=[];
  if(n<2)return'';
  for(let i=0;i<n-1;i++)sec.push((pts[i+1].y-pts[i].y)/(pts[i+1].x-pts[i].x));
  for(let i=0;i<n;i++){
   if(i===0){slope.push(sec[0]);continue;}
   if(i===n-1){slope.push(sec[n-2]);continue;}
   const a=sec[i-1],b=sec[i];slope.push(a*b<=0?0:2*a*b/(a+b));
  }
  for(let i=0;i<n-1;i++){
   if(Math.abs(sec[i])<1e-8){slope[i]=0;slope[i+1]=0;continue;}
   const a=slope[i]/sec[i],b=slope[i+1]/sec[i],q=a*a+b*b;
   if(q>9){const k=3/Math.sqrt(q);slope[i]*=k;slope[i+1]*=k;}
  }
  const c=(x,y)=>x.toFixed(2)+' '+y.toFixed(2);
  let d='M '+c(pts[0].x,pts[0].y);
  for(let i=0;i<n-1;i++){
   const p=pts[i],q=pts[i+1],dx=(q.x-p.x)/3;
   d+=' C '+c(p.x+dx,p.y+dx*slope[i])+' '+c(q.x-dx,q.y-dx*slope[i+1])+' '+c(q.x,q.y);
  }
  return d;
 }
 function makeHalo(svg,line,id,color,d){
  const def=svg.querySelector('defs')||svg.insertBefore(document.createElementNS(NS,'defs'),svg.firstChild);
  const filter=document.createElementNS(NS,'filter');
  filter.id=id;filter.setAttribute('x','-25%');filter.setAttribute('y','-80%');filter.setAttribute('width','150%');filter.setAttribute('height','260%');
  const blur=document.createElementNS(NS,'feGaussianBlur');blur.setAttribute('stdDeviation','1.8');filter.appendChild(blur);def.appendChild(filter);
  const halo=document.createElementNS(NS,'path');halo.setAttribute('d',d);halo.setAttribute('fill','none');halo.setAttribute('stroke',color);
  halo.setAttribute('stroke-width','3.2');halo.setAttribute('stroke-opacity','.30');
  halo.setAttribute('stroke-linecap','round');halo.setAttribute('stroke-linejoin','round');
  halo.setAttribute('filter','url(#'+id+')');halo.setAttribute('pointer-events','none');halo.classList.add('b46-mf-ultrasoft-halo');
  line.parentNode.insertBefore(halo,line);return halo;
 }
 function restore(){
  for(const [svg,state] of tracked){
   for(const item of state.paths){
    if(item.line?.isConnected){item.line.setAttribute('d',item.raw);item.line.style.removeProperty('stroke-width');item.line.style.removeProperty('stroke');}
    if(item.area?.isConnected&&item.rawArea!==null)item.area.setAttribute('d',item.rawArea);
    item.halo?.remove();
   }
   svg.querySelectorAll('filter[id^="b46-ultrasoft-"]').forEach(el=>el.remove());
  }
  tracked.clear();
 }
 function apply(svg){
  const head=svg.closest('.expand-flow-card')?.querySelector('.expand-card-head b')?.textContent||'';
  const m=head.match(/→\s*(\d+)/);
  const current=m?Number(m[1]):null;
  const view=svg.viewBox?.baseVal;
  if(!current||!view||view.width<=56)return;
  const lines=[svg.querySelector('.expand-flow-line.home'),svg.querySelector('.expand-flow-line.away')];
  const areas=[...svg.querySelectorAll('.expand-flow-area')];
  if(lines.some(x=>!x)||areas.length<2)return;
  let state=tracked.get(svg);
  if(!state){state={paths:[]};tracked.set(svg,state);}
  for(let i=0;i<2;i++){
   const line=lines[i],area=areas[i],d=line.getAttribute('d')||'';
   let item=state.paths[i];
   if(item&&item.line===line&&d===item.rendered)continue;
   const pts=pointsFromPath(d);
   if(!pts)continue;
   if(item){item.halo?.remove();}
   const p=smooth(pts,current,view.width),newPath=curve(p);
   const base=view.height-30;
   const end=p[p.length-1],first=p[0];
   const areaPath='M '+first.x.toFixed(2)+' '+base.toFixed(2)+' L '+first.x.toFixed(2)+' '+first.y.toFixed(2)+newPath.slice(newPath.indexOf(' C '))+' L '+end.x.toFixed(2)+' '+base.toFixed(2)+' Z';
   const color=i?'#edcb69':'#4ce0a0',id='b46-ultrasoft-'+(++nextId);
   item={line,area,raw:d,rawArea:area.getAttribute('d'),rendered:newPath,halo:makeHalo(svg,line,id,color,newPath)};
   state.paths[i]=item;
   line.setAttribute('d',newPath);area.setAttribute('d',areaPath);
   line.style.setProperty('stroke-width',i?'0.95px':'1.05px','important');
   line.style.setProperty('stroke',color,'important');
  }
 }
 function process(){
  scheduled=false;
  if(!mq.matches){if(tracked.size)restore();return;}
  for(const [svg] of tracked)if(!svg.isConnected)tracked.delete(svg);
  document.querySelectorAll('.expand-flow-chart.b46-mf-chart svg').forEach(apply);
 }
 function schedule(){
  if(scheduled)return;scheduled=true;requestAnimationFrame(process);
 }
 const observer=new MutationObserver(records=>{
  for(const r of records){
   if(r.type==='childList'&&(r.addedNodes.length||r.removedNodes.length)){schedule();return;}
   if(r.type==='attributes'&&r.attributeName==='d'&&r.target?.classList?.contains('expand-flow-line')){schedule();return;}
  }
 });
 function start(){
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['d']});
  schedule();
  mq.addEventListener?.('change',schedule);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
</script>`;
export function injectFlowOverlay(html){
 if(typeof html!=='string'||!html.includes('</body>'))throw Error('HTML_TARGET_MISSING');
 if(!html.includes('b46-pc-seamless-drawer-20261020'))throw Error('ACTIVE_PC_DRAWER_MISSING');
 if(html.includes(OVERLAY_MARK))throw Error('MOBILE_OVERLAY_ALREADY_PRESENT');
 return html.replace('</body>',OVERLAY_HTML+'</body>');
}

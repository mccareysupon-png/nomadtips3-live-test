(()=>{'use strict';
const desktop=matchMedia('(min-width:768px)'),states=new Map(),ns='http://www.w3.org/2000/svg';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uninstall(chart,s){s.resize.disconnect();if(s.space.contains(chart))s.space.before(chart);s.space.remove();chart.removeAttribute('data-b46-lanes');states.delete(chart);}
function install(chart){
 if(states.has(chart))return;
 const svg=chart.querySelector('svg'),card=chart.closest('.expand-flow-card');if(!svg||!card||!chart.dataset.b46Flow)return;
 const laneHeight=card.getBoundingClientRect().height*.2;if(laneHeight<43||!chart.clientWidth)return;
 const space=document.createElement('div');space.className='b46-flow-space';space.style.setProperty('--lane-height',laneHeight+'px');
 const top=document.createElement('div'),bottom=document.createElement('div'),lines=document.createElementNS(ns,'svg');top.className='b46-flow-lane top';bottom.className='b46-flow-lane bottom';lines.setAttribute('class','b46-flow-connectors');lines.setAttribute('aria-hidden','true');
 chart.before(space);space.append(top,chart,bottom,lines);chart.dataset.b46Lanes='20261027';
 const s={space,top,bottom,lines,laneHeight,pages:{top:0,bottom:0},signature:'',resize:null};states.set(chart,s);
 s.resize=new ResizeObserver(()=>layout(chart,s));s.resize.observe(chart);layout(chart,s);
}
function layout(chart,s){
 const svg=chart.querySelector('svg');if(!svg)return;const view=svg.viewBox.baseVal,cr=chart.getBoundingClientRect(),sr=svg.getBoundingClientRect(),wr=s.space.getBoundingClientRect(),width=wr.width;
 if(!view.width||!view.height||!width)return;
 const rows=[...svg.querySelectorAll('.b46-eventflow-signal-annotation')].flatMap(g=>{const text=[...g.querySelectorAll('text')].map(x=>x.textContent),point=g.querySelector('circle'),minute=Number(g.dataset.signalMinute);if(!point||text.length<3||!Number.isFinite(minute))return[];return[{minute,title:g.getAttribute('aria-label'),name:text[1],detail:text[2],side:/\bHOME\b/.test(text[1])?'home':/\bAWAY\b/.test(text[1])?'away':null,x:sr.left-wr.left+Number(point.getAttribute('cx'))/view.width*sr.width,y:sr.top-wr.top+Number(point.getAttribute('cy'))/view.height*sr.height}];});
 const signature=JSON.stringify([rows,width,cr.height,s.pages]);if(s.signature===signature)return;s.signature=signature;
 const groups={top:rows.filter(r=>r.side==='home'),bottom:rows.filter(r=>r.side==='away')};for(const r of rows.filter(r=>!r.side))groups[groups.top.length<=groups.bottom.length?'top':'bottom'].push(r);
 const cap=Math.max(1,Math.floor((width-100)/180));s.lines.replaceChildren();
 for(const side of ['top','bottom']){const lane=s[side],list=groups[side].sort((a,b)=>a.minute-b.minute),count=Math.max(1,Math.ceil(list.length/cap));s.pages[side]=Math.min(s.pages[side],count-1);const visible=list.slice(s.pages[side]*cap,(s.pages[side]+1)*cap),end=width-(count>1?77:8);lane.replaceChildren();const pos=visible.map(r=>Math.max(8,Math.min(end-174,r.x-87)));for(let i=1;i<pos.length;i++)pos[i]=Math.max(pos[i],pos[i-1]+180);if(pos.length&&pos.at(-1)+174>end){pos[pos.length-1]=end-174;for(let i=pos.length-2;i>=0;i--)pos[i]=Math.min(pos[i],pos[i+1]-180);}
 visible.forEach((r,i)=>{const el=document.createElement('button');el.type='button';el.className='b46-flow-signal'+(r.side==='away'?' away':'');el.style.left=pos[i]+'px';el.title=r.title||'';el.innerHTML=`<span class="card-top"><span>${esc(r.name)}</span><small>${r.minute}′</small></span><span class="card-detail">${esc(r.detail)}</span>`;lane.append(el);
 const line=document.createElementNS(ns,'path'),dot=document.createElementNS(ns,'circle'),edge=side==='top'?cr.top-wr.top:cr.bottom-wr.top,start=side==='top'?s.laneHeight/2+21.5:s.laneHeight+cr.height+s.laneHeight/2-21.5;
 line.setAttribute('d',`M ${Math.max(pos[i]+12,Math.min(pos[i]+162,r.x))} ${start} L ${r.x} ${edge} L ${r.x} ${r.y}`);line.setAttribute('class',r.side==='away'?'away':'home');dot.setAttribute('cx',r.x);dot.setAttribute('cy',r.y);dot.setAttribute('r','3');dot.setAttribute('class',r.side==='away'?'away':'home');s.lines.append(line,dot);
 const active=on=>line.classList.toggle('active',on);el.onmouseenter=()=>active(true);el.onmouseleave=()=>active(false);el.onfocus=()=>active(true);el.onblur=()=>active(false);
 });
 if(count>1){const button=document.createElement('button');button.type='button';button.className='b46-flow-page';button.textContent=`${s.pages[side]+1}/${count} →`;button.setAttribute('aria-label',`Next ${side} signal group`);button.onclick=()=>{s.pages[side]=(s.pages[side]+1)%count;layout(chart,s)};lane.append(button);}
 }
}
let queued=false;function scan(){queued=false;for(const [chart,s]of states){if(!chart.isConnected||!desktop.matches)uninstall(chart,s);else layout(chart,s);}if(desktop.matches)document.querySelectorAll('.expand-flow-chart[data-b46-flow]').forEach(install);}
const observer=new MutationObserver(records=>{if(queued)return;const relevant=records.some(r=>{if(r.target.closest?.('.b46-flow-lane,.b46-flow-connectors,.b46-inspect-layer,.b46-inspect-tip,.b46-inspect-sr'))return false;return r.type==='attributes'||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('.expand-flow-chart,svg,.b46-eventflow-signal-annotation')||n.querySelector?.('.expand-flow-chart,.b46-eventflow-signal-annotation')))});if(relevant){queued=true;queueMicrotask(scan)}});
function boot(){observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-b46-flow']});scan();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();desktop.addEventListener('change',scan);
})();
